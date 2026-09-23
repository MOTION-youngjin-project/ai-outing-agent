import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { normalizeSido, SIDO_LATLON, latLonToGrid } from "../region.ts";
import { withRetry } from "../withRetry.ts";

// 기상청 단기예보 조회서비스(getVilageFcst)
// https://www.data.go.kr/data/15084084/openapi.do
const KMA_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";

const SKY_LABEL: Record<string, string> = { "1": "맑음", "3": "구름많음", "4": "흐림" };
const PTY_LABEL: Record<string, string> = { "0": "없음", "1": "비", "2": "비/눈", "3": "눈", "4": "소나기" };

// 단기예보 발표시각: 02,05,08,11,14,17,20,23시 (발표 후 10분 뒤부터 조회 가능)
// 서버 타임존과 무관하게 KST 기준으로 계산해야 하므로 UTC+9로 보정한 뒤 UTC 게터로 읽는다
// (로컬 게터를 쓰면 UTC로 도는 서버에서 날짜 경계 근처 몇 시간 동안 발표 주기가 틀어진다).
export function latestBaseDateTime(now: Date): { base_date: string; base_time: string } {
  const times = [2, 5, 8, 11, 14, 17, 20, 23];
  const kst = new Date(now.getTime() - 10 * 60 * 1000 + 9 * 60 * 60 * 1000); // 10분 버퍼 + KST 보정
  const hour = kst.getUTCHours();
  let base = [...times].reverse().find((t) => t <= hour);

  if (base === undefined) {
    kst.setUTCDate(kst.getUTCDate() - 1);
    base = 23;
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const base_date = `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`;
  const base_time = `${pad(base)}00`;
  return { base_date, base_time };
}

async function fetchOnce(nx: number, ny: number, apiKey: string) {
  const { base_date, base_time } = latestBaseDateTime(new Date());
  const params = new URLSearchParams({
    returnType: "json",
    numOfRows: "1000",
    pageNo: "1",
    dataType: "JSON",
    base_date,
    base_time,
    nx: String(nx),
    ny: String(ny),
  });

  const res = await fetch(`${KMA_URL}?serviceKey=${apiKey}&${params}`, {
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json();

  const errMsg = data?.OpenAPI_ServiceResponse?.cmmMsgHeader?.errMsg;
  if (errMsg) throw new Error(`기상청 서비스 오류: ${errMsg}`);

  const header = data?.response?.header;
  if (header?.resultCode !== "00") {
    throw new Error(`기상청 API 오류: ${header?.resultMsg ?? "알 수 없는 오류"}`);
  }

  const items: { category: string; fcstDate: string; fcstTime: string; fcstValue: string }[] =
    data?.response?.body?.items?.item ?? [];
  if (items.length === 0) throw new Error("예보 데이터를 찾을 수 없습니다.");

  // 한 응답에 포함된 시간대별 값을 보존한다. 배지를 펼칠 때 기상청을 다시 호출하지 않는다.
  const grouped = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.fcstDate + item.fcstTime;
    const slot = grouped.get(key) ?? [];
    slot.push(item);
    grouped.set(key, slot);
  }
  // 슬롯에 TMP가 없다고 통째로 버리면(응답이 부분적으로 잘려온 경우) hourly가
  // 비어서 아래에서 던지고, 그러면 최초 조회(캐시 없음)인 지역은 날씨 배지 자체가
  // 사라진다. tmp는 없을 수 있는 값으로 두고 그대로 내보낸다 — 호출부(weatherTool,
  // getCachedWeather)는 이미 tmp가 없을 때 null/"?"로 대체하도록 돼 있다.
  const hourly = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, slot]) => {
      const get = (category: string) => slot.find((item) => item.category === category)?.fcstValue;
      return { fcstDate: key.slice(0, 8), fcstTime: key.slice(8), sky: SKY_LABEL[get("SKY") ?? ""] ?? "정보없음", pty: PTY_LABEL[get("PTY") ?? ""] ?? "없음", tmp: get("TMP"), pop: get("POP") };
    })
    .slice(0, 12);
  return { ...hourly[0], hourly };
}

// ponytail: 에어코리아와 동일하게 SERVICETIMEOUT_ERROR가 잦아 최대 3회 재시도.
export async function fetchWeather(nx: number, ny: number) {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) throw new Error("DATA_GO_KR_API_KEY가 설정되지 않았습니다.");

  return withRetry(() => fetchOnce(nx, ny, apiKey), 3);
}

export const weatherTool = tool(
  async ({ region, query }) => {
    // ponytail: get_air_quality와 같은 원인의 같은 방어 — airQuality.ts의 동일 패턴 주석 참고.
    const input = region ?? query;
    if (!input) return "지역 정보가 없어 날씨를 조회할 수 없습니다.";

    // get_air_quality와 같은 이유로 같은 방어: 이 앱은 대구 전용이라 구/군만 언급되면
    // (다른 시/도와 이름이 겹칠 수 있어) normalizeSido가 못 잡는다 — 대구로 간주한다.
    const sidoName = normalizeSido(input) ?? "대구";

    try {
      const { lat, lon } = SIDO_LATLON[sidoName];
      const { nx, ny } = latLonToGrid(lat, lon);
      const { sky, pty, tmp, pop } = await fetchWeather(nx, ny);
      const precipitation = pty !== "없음" ? `, 강수형태 "${pty}"` : "";
      return `${sidoName} 지역 예보(${tmp ?? "?"}도, 하늘상태 "${sky}"${precipitation}, 강수확률 ${pop ?? "?"}%) 기준입니다.`;
    } catch (err) {
      return `날씨 조회에 실패했습니다: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
  {
    name: "get_weather",
    description:
      "특정 지역(시/도 단위)의 단기 날씨 예보(하늘상태, 강수, 기온)를 조회한다. 날씨나 컨디션이 애매하게 언급될 때 대기질과 함께 확인해서 실내/야외 활동 판단에 활용한다.",
    schema: z.object({
      region: z.string().optional().describe("날씨를 조회할 지역명 (예: 대구, 서울)"),
      query: z.string().optional().describe("(다른 도구와 헷갈렸을 때 대비 — region과 동일하게 처리)"),
    }),
  }
);
