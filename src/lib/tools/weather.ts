import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { normalizeSido, SIDO_LATLON, latLonToGrid } from "@/lib/region";

// 기상청 단기예보 조회서비스(getVilageFcst)
// https://www.data.go.kr/data/15084084/openapi.do
const KMA_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";

const SKY_LABEL: Record<string, string> = { "1": "맑음", "3": "구름많음", "4": "흐림" };
const PTY_LABEL: Record<string, string> = { "0": "없음", "1": "비", "2": "비/눈", "3": "눈", "4": "소나기" };

// 단기예보 발표시각: 02,05,08,11,14,17,20,23시 (발표 후 10분 뒤부터 조회 가능)
export function latestBaseDateTime(now: Date): { base_date: string; base_time: string } {
  const times = [2, 5, 8, 11, 14, 17, 20, 23];
  const d = new Date(now.getTime() - 10 * 60 * 1000); // 10분 버퍼
  const hour = d.getHours();
  let base = [...times].reverse().find((t) => t <= hour);

  if (base === undefined) {
    d.setDate(d.getDate() - 1);
    base = 23;
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const base_date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
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

  // 가장 이른 fcstDate+fcstTime(다음 예보 시각) 하나를 골라 그 시각의 카테고리 값들을 모은다.
  const earliest = [...items].sort((a, b) =>
    (a.fcstDate + a.fcstTime).localeCompare(b.fcstDate + b.fcstTime)
  )[0];
  const target = earliest.fcstDate + earliest.fcstTime;
  const slot = items.filter((i) => i.fcstDate + i.fcstTime === target);

  const get = (category: string) => slot.find((i) => i.category === category)?.fcstValue;
  return {
    fcstDate: earliest.fcstDate,
    fcstTime: earliest.fcstTime,
    sky: SKY_LABEL[get("SKY") ?? ""] ?? "정보없음",
    pty: PTY_LABEL[get("PTY") ?? ""] ?? "없음",
    tmp: get("TMP"),
    pop: get("POP"),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ponytail: 에어코리아와 동일하게 SERVICETIMEOUT_ERROR가 잦아 최대 3회 재시도.
export async function fetchWeather(nx: number, ny: number) {
  const apiKey = process.env.KMA_API_KEY;
  if (!apiKey) throw new Error("KMA_API_KEY가 설정되지 않았습니다.");

  const MAX_ATTEMPTS = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchOnce(nx, ny, apiKey);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) await sleep(500);
    }
  }
  throw lastError;
}

export const weatherTool = tool(
  async ({ region }) => {
    const sidoName = normalizeSido(region);
    if (!sidoName) {
      return `"${region}"은(는) 날씨 조회가 가능한 시/도 단위 지역명이 아닙니다. 서울, 부산, 대구 같은 시/도 이름으로 다시 물어봐 주세요.`;
    }

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
      region: z.string().describe("날씨를 조회할 지역명 (예: 대구, 서울)"),
    }),
  }
);
