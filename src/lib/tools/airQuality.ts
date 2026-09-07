import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { normalizeSido } from "../region.ts";

// 한국환경공단 에어코리아 - 시도별 실시간 측정정보 조회
// https://www.data.go.kr/data/15073861/openapi.do
// data.go.kr이 발급하는 "인증키(Encoding)"는 이미 URL 인코딩된 값이라, URLSearchParams로
// 다시 인코딩하면 이중 인코딩되어 인증 실패한다. serviceKey는 쿼리스트링에 직접 붙인다.
const AIRKOREA_URL =
  "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty";

// PM10 24시간 등급 기준 (에어코리아 통합대기환경지수 기준, ㎍/m³)
export function gradeFromPm10(pm10: number): string {
  if (pm10 <= 30) return "좋음";
  if (pm10 <= 80) return "보통";
  if (pm10 <= 150) return "나쁨";
  return "매우나쁨";
}

async function fetchOnce(sidoName: string, apiKey: string) {
  const params = new URLSearchParams({
    returnType: "json",
    numOfRows: "200", // 경기 등 측정소 100개 넘는 시/도가 있어 여유있게 잡음 (경기 126곳 확인)
    pageNo: "1",
    sidoName,
    ver: "1.3",
  });

  const res = await fetch(`${AIRKOREA_URL}?serviceKey=${apiKey}&${params}`, {
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json();

  // 정상 응답과 서비스 오류(SERVICETIMEOUT_ERROR 등) 응답은 JSON 구조 자체가 다르다.
  const errMsg = data?.OpenAPI_ServiceResponse?.cmmMsgHeader?.errMsg;
  if (errMsg) throw new Error(`에어코리아 서비스 오류: ${errMsg}`);

  const header = data?.response?.header;
  if (header?.resultCode !== "00") {
    throw new Error(`에어코리아 API 오류: ${header?.resultMsg ?? "알 수 없는 오류"}`);
  }

  const items: { pm10Value: string; stationName: string }[] = data?.response?.body?.items ?? [];
  const values = items
    .map((item) => Number(item.pm10Value))
    .filter((v) => Number.isFinite(v));

  if (values.length === 0) {
    throw new Error(`${sidoName} 지역의 측정 데이터를 찾을 수 없습니다.`);
  }

  const avgPm10 = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  return { pm10: avgPm10, grade: gradeFromPm10(avgPm10), stationCount: values.length };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ponytail: 에어코리아 API가 SERVICETIMEOUT_ERROR를 자주 반환해(실측 4회 중 3회) 최대 3회 재시도.
// 계속 실패하면 지수 백오프/재시도 큐 등 정교한 재시도 전략 도입.
export async function fetchAirQuality(sidoName: string) {
  const apiKey = process.env.AIRKOREA_API_KEY;
  if (!apiKey) throw new Error("AIRKOREA_API_KEY가 설정되지 않았습니다.");

  const MAX_ATTEMPTS = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchOnce(sidoName, apiKey);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) await sleep(500);
    }
  }
  throw lastError;
}

export const airQualityTool = tool(
  async ({ region }) => {
    const sidoName = normalizeSido(region);
    if (!sidoName) {
      return `"${region}"은(는) 대기질 조회가 가능한 시/도 단위 지역명이 아닙니다. 서울, 부산, 대구 같은 시/도 이름으로 다시 물어봐 주세요.`;
    }

    try {
      const { pm10, grade, stationCount } = await fetchAirQuality(sidoName);
      return `${sidoName} 지역 미세먼지(PM10) 평균 농도는 ${pm10}㎍/m³ (측정소 ${stationCount}곳 평균), 등급은 "${grade}"입니다.`;
    } catch (err) {
      return `대기질 조회에 실패했습니다: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
  {
    name: "get_air_quality",
    description:
      "특정 지역(시/도 단위)의 실시간 미세먼지(대기질) 정보를 조회한다. 날씨나 컨디션이 애매하게 언급될 때도 먼저 확인해서 실내/야외 활동 판단에 활용한다.",
    schema: z.object({
      region: z.string().describe("대기질을 조회할 지역명 (예: 대구, 서울)"),
    }),
  }
);
