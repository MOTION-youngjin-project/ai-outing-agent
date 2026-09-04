import { tool } from "@langchain/core/tools";
import { z } from "zod";

// 문화체육관광부_문화예술공연(통합) - 문화공공데이터광장(KCISA)
// https://www.culture.go.kr/data/openapi/openapiView.do?id=580
// 응답이 XML 고정이라 자체 파서로 처리한다 (필드가 중첩 없이 flat이라 정규식으로 충분).
const CULTURE_URL = "https://api.kcisa.kr/openapi/CNV_060/request";

export const CULTURE_DTYPES = ["연극", "뮤지컬", "오페라", "음악", "콘서트", "국악", "무용", "전시", "기타"] as const;

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
    signal: AbortSignal.timeout(8000),
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

  return parsed;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ponytail: 에어코리아/기상청과 동일하게 최대 3회 재시도 (공공데이터 API 공통 불안정성 대응).
export async function fetchCulturePortal(dtype: string, keyword: string) {
  const apiKey = process.env.CULTURE_PORTAL_API_KEY;
  if (!apiKey) throw new Error("CULTURE_PORTAL_API_KEY가 설정되지 않았습니다.");

  const MAX_ATTEMPTS = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchOnce(dtype, keyword, apiKey);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) await sleep(500);
    }
  }
  throw lastError;
}

export const culturePortalTool = tool(
  async ({ dtype, keyword }) => {
    try {
      const items = await fetchCulturePortal(dtype, keyword ?? "");
      if (items.length === 0) {
        return `"${dtype}" 분야로 검색된 공연/전시가 없습니다.`;
      }

      // 이 API는 지역(시/도) 파라미터가 없어 전국 결과를 그대로 반환한다.
      const list = items
        .map(
          (i) =>
            `- ${i.title} (${i.eventPeriod}, ${i.eventSite})${i.url ? ` 링크:${i.url}` : ""}${i.imageUrl ? ` 이미지:${i.imageUrl}` : ""}`
        )
        .join("\n");
      return `"${dtype}" 분야 전국 공연/전시 검색 결과입니다 (지역별 필터링은 지원하지 않아 전국 결과 중 일부):\n${list}`;
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
      dtype: z.enum(CULTURE_DTYPES).describe("검색할 문화행사 분야"),
      keyword: z.string().optional().describe("제목에 포함될 검색어 (없으면 빈 문자열로 전체 검색)"),
    }),
  }
);
