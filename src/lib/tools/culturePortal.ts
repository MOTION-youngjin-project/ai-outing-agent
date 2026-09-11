import { tool } from "@langchain/core/tools";
import { z } from "zod";

// 문화체육관광부_문화예술공연(통합) - 문화공공데이터광장(KCISA)
// https://www.culture.go.kr/data/openapi/openapiView.do?id=580
// 응답이 XML 고정이라 자체 파서로 처리한다 (필드가 중첩 없이 flat이라 정규식으로 충분).
const CULTURE_URL = "https://api.kcisa.kr/openapi/CNV_060/request";

export const DTYPES = ["연극", "뮤지컬", "오페라", "음악", "콘서트", "국악", "무용", "전시", "기타"] as const;

// dtype 없이 들어온 텍스트에서 분야를 추정한다 — 못 찾으면 시스템 프롬프트가 이미 쓰는
// 기본값과 맞춰 "전시"로 둔다(agent.ts: "아이 동반이나 체험 활동을 물어보면 '전시'로").
export function inferDtype(text: string): (typeof DTYPES)[number] {
  return DTYPES.find((d) => text.includes(d)) ?? "전시";
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// 실제 HTML 태그(<p>, <br/> 등, 알파벳으로 시작)만 제거한다.
// 이 API는 <공간드림 1472> 처럼 제목에 꺾쇠괄호를 장식용으로 쓰는 경우가 있어,
// 모든 <...>를 태그로 취급하면 제목 일부가 잘려나간다.
export function stripTags(text: string): string {
  return decodeEntities(text).replace(/<\/?[a-zA-Z][^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1] : "";
}

// eventPeriod는 이 API에서 항상 "YYYYMMDD ~ YYYYMMDD" 형식으로 온다(실측 확인).
// 형식이 다르면(향후 API 변경 등) 모르는 채로 숨기지 않고 그냥 보여준다.
export function isEventEnded(eventPeriod: string, now = Date.now()): boolean {
  const endStr = eventPeriod.split("~")[1]?.trim();
  if (!endStr || !/^\d{8}$/.test(endStr)) return false;
  const end = new Date(`${endStr.slice(0, 4)}-${endStr.slice(4, 6)}-${endStr.slice(6, 8)}T23:59:59`);
  return end.getTime() < now;
}

export type PerformanceItem = {
  title: string;
  eventPeriod: string;
  eventSite: string;
  url: string;
  imageUrl: string;
};

async function fetchOnce(dtype: string, keyword: string, apiKey: string) {
  const params = new URLSearchParams({
    serviceKey: apiKey,
    dtype,
    title: keyword,
    numOfRows: "5",
    pageNo: "1",
  });

  const res = await fetch(`${CULTURE_URL}?${params}`, {
    // 5초. 실측(2026-09-12)에서 성공 응답은 0.4~4.0초였고, 그보다 느리면 대개 끝까지 응답이
    // 안 온다 — 8초씩 세 번 기다리다 25초를 버리는 게 실제로 관측됐다.
    signal: AbortSignal.timeout(5000),
  });
  const xml = await res.text();

  const resultCode = extractTag(xml, "resultCode");
  if (resultCode !== "0000") {
    throw new Error(`문화포털 API 오류: ${extractTag(xml, "resultMsg") || "알 수 없는 오류"}`);
  }

  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  const parsed: PerformanceItem[] = items.map((item) => ({
    title: stripTags(extractTag(item, "title")),
    eventPeriod: extractTag(item, "eventPeriod"),
    eventSite: stripTags(extractTag(item, "eventSite")),
    url: extractTag(item, "url"),
    imageUrl: extractTag(item, "imageObject"),
  }));

  // 이미 끝난 행사는 검색 결과(직접 검색 화면·AI 추천 도구 둘 다)에서 제외한다.
  return parsed.filter((item) => !isEventEnded(item.eventPeriod));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 성공 결과만 1시간 캐시한다. 행사 목록은 하루 단위로 바뀌는데 이 API는 같은 질의에도
// 25초 타임아웃과 0.4초 응답을 오가서, 한 번 받아둔 결과를 재사용하는 편이 훨씬 안정적이다.
// (프로세스 메모리 — 인스턴스가 하나뿐이라 테이블을 새로 만들 이유가 없다.)
const CACHE_TTL_MS = 60 * 60 * 1000;
// 실패도 5분 기억한다. 이 API는 한 번 응답이 끊기면 한동안 계속 끊겨서, 매 요청마다
// 10.5초(5초 타임아웃 x 2회)를 다시 버리는 것이 실측됐다. 5분 뒤에는 다시 시도한다.
const FAILURE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; items: PerformanceItem[] }>();
const failures = new Map<string, number>();

// ponytail: 공공데이터 API 공통 불안정성 대응 재시도. 3회에서 2회로 줄였다 —
// 실측상 첫 시도가 타임아웃이면 재시도도 대개 타임아웃이라, 최악이 25초에서 10.5초가 된다.
export async function fetchCulturePortal(dtype: string, keyword: string): Promise<PerformanceItem[]> {
  const apiKey = process.env.CULTURE_PORTAL_API_KEY;
  if (!apiKey) throw new Error("CULTURE_PORTAL_API_KEY가 설정되지 않았습니다.");

  const cacheKey = dtype + "::" + keyword;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;

  const failedAt = failures.get(cacheKey);
  if (failedAt && Date.now() - failedAt < FAILURE_TTL_MS) {
    throw new Error("문화포털 API가 응답하지 않습니다(최근 실패, 잠시 후 다시 시도).");
  }

  const MAX_ATTEMPTS = 2;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const items = await fetchOnce(dtype, keyword, apiKey);
      cache.set(cacheKey, { at: Date.now(), items });
      failures.delete(cacheKey);
      return items;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) await sleep(500);
    }
  }
  failures.set(cacheKey, Date.now());
  throw lastError;
}

export const culturePortalTool = tool(
  async ({ dtype, keyword, query, region }) => {
    // ponytail: get_air_quality 등과 같은 원인의 같은 방어 — airQuality.ts의 동일 패턴
    // 주석 참고. dtype은 필수 enum이라 빠져 있으면 텍스트에서 추정한다(inferDtype).
    const fallbackText = keyword ?? query ?? region;
    const effectiveDtype = dtype ?? inferDtype(fallbackText ?? "");
    const effectiveKeyword = keyword ?? query ?? "";

    try {
      const items = await fetchCulturePortal(effectiveDtype, effectiveKeyword);
      if (items.length === 0) {
        return `"${effectiveDtype}" 분야로 검색된 공연/전시가 없습니다.`;
      }

      // 이 API는 지역(시/도) 파라미터가 없어 전국 결과를 그대로 반환한다.
      const list = items
        .map(
          (i) =>
            `- ${i.title} (${i.eventPeriod}, ${i.eventSite})${i.url ? ` 링크:${i.url}` : ""}${i.imageUrl ? ` 이미지:${i.imageUrl}` : ""}`
        )
        .join("\n");
      return `"${effectiveDtype}" 분야 전국 공연/전시 검색 결과입니다 (지역별 필터링은 지원하지 않아 전국 결과 중 일부):\n${list}`;
    } catch (err) {
      return `문화행사 조회에 실패했습니다: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
  {
    name: "search_culture_events",
    description:
      "공연/전시 행사를 분야별로 검색한다. 지역 필터링은 지원하지 않으므로 전국 결과 중에서 추천해야 한다. " +
      "아이 동반이나 체험 활동을 물어보면 '전시'로, 공연을 물어보면 관련 분야로 검색한다.",
    schema: z.object({
      dtype: z.enum(DTYPES).optional().describe("검색할 문화행사 분야"),
      keyword: z.string().optional().describe("제목에 포함될 검색어 (없으면 빈 문자열로 전체 검색)"),
      query: z.string().optional().describe("(다른 도구와 헷갈렸을 때 대비 — keyword와 동일하게 처리)"),
      region: z.string().optional().describe("(다른 도구와 헷갈렸을 때 대비 — keyword와 동일하게 처리)"),
    }),
  }
);
