import { tool } from "@langchain/core/tools";
import { z } from "zod";

// 대구광역시 통합주차정보시스템 - 민간주차장 API(주차장정보 조회)
// https://pis.daegu.go.kr/api/mingan/prkInfo
// 대구광역시 관할 구/군 단위로만 조회 가능. 인증은 쿼리스트링이 아니라 Authentication 헤더.
const PARKING_URL = "https://pis.daegu.go.kr/api/mingan/prkInfo";

// 실시간주차혼잡도 조회 서비스 — 위 prkInfo(정적 정보)와 별도 엔드포인트.
// pkltId 단위로만 조회되고 구/군 필터가 없다. 같은 DAEGU_PARKING_API_KEY로 동작 확인함
// (notes/daegu-parking-and-map-links-research.md 참고 — /api/mingan/rltmPrkInfo는
// 민간사업자가 데이터를 "제출"하는 별개 API라 우리가 쓸 게 아니었음).
const REALTIME_URL = "https://pis.daegu.go.kr/api/serviceApply/rltmPrkInfo";

export const DAEGU_DISTRICTS = [
  "중구", "동구", "서구", "남구", "북구", "수성구", "달서구", "달성군", "군위군",
] as const;

const DISTRICT_CODES: Record<string, string> = {
  중구: "150",
  동구: "151",
  서구: "152",
  남구: "153",
  북구: "154",
  수성구: "155",
  달서구: "156",
  달성군: "157",
  군위군: "361",
};

type ParkingItem = {
  prkInfo: { pkltId: string; pkltNm: string; sysgrpyYn: string };
  prkFcltInfo: { lotnoAddr: string; prkNocmprt: number; lat: number | null; lot: number | null };
  prkOperInfo: { crgLevySeNm: string | null; gnrlOneHrCrg: number | null };
};

async function fetchOnce(sggCd: string, apiKey: string) {
  const params = new URLSearchParams({ sggCd });
  const res = await fetch(`${PARKING_URL}?${params}`, {
    headers: { accept: "application/json;charset=UTF-8", Authentication: apiKey },
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json();

  if (data?.resultCode !== "200") {
    throw new Error(`대구 주차정보 API 오류: ${data?.message ?? "알 수 없는 오류"}`);
  }
  return (data?.data ?? []) as ParkingItem[];
}

async function fetchRealtimeOnce(pkltId: string, apiKey: string): Promise<number | null> {
  const params = new URLSearchParams({ numOfRows: "1", pageNo: "1", pkltId });
  const res = await fetch(`${REALTIME_URL}?${params}`, {
    headers: { accept: "application/json;charset=UTF-8", Authentication: apiKey },
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json();
  if (data?.resultCode !== "200") return null;
  const rmnd = data?.data?.[0]?.rltmPrkInfo?.totRmndPrkNocmprt;
  return typeof rmnd === "number" ? rmnd : null;
}

// 전체 344곳 중 실시간 연동된 곳은 일부(109곳)뿐이라, 없으면 null(실시간 정보 없음)로
// 처리한다 — 에러가 나도 정적 정보(총 면수)는 이미 있으니 페이지 전체를 실패시키지 않는다.
async function fetchRealtimeParking(pkltId: string, apiKey: string): Promise<number | null> {
  try {
    return await fetchRealtimeOnce(pkltId, apiKey);
  } catch {
    return null;
  }
}

export function formatFee(crgLevySeNm: string | null, gnrlOneHrCrg: number | null): string {
  if (crgLevySeNm === "무료") return "무료";
  if (gnrlOneHrCrg !== null) return `시간당 ${gnrlOneHrCrg}원`;
  return crgLevySeNm ?? "요금정보 없음";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchParking(sggCd: string) {
  const apiKey = process.env.DAEGU_PARKING_API_KEY;
  if (!apiKey) throw new Error("DAEGU_PARKING_API_KEY가 설정되지 않았습니다.");

  const MAX_ATTEMPTS = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchOnce(sggCd, apiKey);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) await sleep(500);
    }
  }
  throw lastError;
}

export type ParkingSpot = {
  name: string;
  address: string;
  capacity: number;
  remainingSpaces: number | null;
  fee: string;
  latitude: number | null;
  longitude: number | null;
};

// LangChain 도구와 /api/parking 라우트가 공유하는 구조화된 조회 함수.
// 좌표는 API가 주지만 기준점(사용자가 실제로 서있는 위치)이 없어 거리순 정렬은 지원하지 않는다.
export async function getDaeguParking(district: string): Promise<ParkingSpot[]> {
  const sggCd = DISTRICT_CODES[district];
  if (!sggCd) return [];

  // sysgrpyYn(실시간 연동 플래그)이 Y인 주차장이 실제로 실시간 잔여대수를 가질
  // 확률이 훨씬 높아서(실측 확인함), 앞쪽에 오도록 정렬한 뒤 5개를 뽑는다.
  const all = await fetchParking(sggCd);
  const items = [...all]
    .sort((a, b) => Number(b.prkInfo.sysgrpyYn === "Y") - Number(a.prkInfo.sysgrpyYn === "Y"))
    .slice(0, 5);
  const apiKey = process.env.DAEGU_PARKING_API_KEY;
  const remainingSpacesList = apiKey
    ? await Promise.all(items.map((i) => fetchRealtimeParking(i.prkInfo.pkltId, apiKey)))
    : items.map(() => null);

  return items.map((i, idx) => ({
    name: i.prkInfo.pkltNm,
    address: i.prkFcltInfo.lotnoAddr,
    capacity: i.prkFcltInfo.prkNocmprt,
    remainingSpaces: remainingSpacesList[idx],
    fee: formatFee(i.prkOperInfo.crgLevySeNm, i.prkOperInfo.gnrlOneHrCrg),
    latitude: i.prkFcltInfo.lat,
    longitude: i.prkFcltInfo.lot,
  }));
}

export const parkingTool = tool(
  async ({ district }) => {
    if (!DISTRICT_CODES[district]) {
      return `"${district}"은(는) 대구광역시 구/군이 아닙니다. 이 도구는 대구광역시(중구·동구·서구·남구·북구·수성구·달서구·달성군·군위군) 내 주차장만 조회 가능합니다.`;
    }

    try {
      const spots = await getDaeguParking(district);
      if (spots.length === 0) return `${district}에 등록된 주차장 정보를 찾을 수 없습니다.`;

      const list = spots
        .map((s) => {
          const realtime = s.remainingSpaces !== null ? `실시간 잔여 ${s.remainingSpaces}면` : "실시간 정보 없음";
          return `- ${s.name} (${s.address}, 총 ${s.capacity}면, ${s.fee}, ${realtime})`;
        })
        .join("\n");

      return `${district} 주차장 목록 중 일부입니다 (좌표/거리 기반 정렬은 지원 안 함):\n${list}`;
    } catch (err) {
      return `주차장 조회에 실패했습니다: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
  {
    name: "search_daegu_parking",
    description:
      "대구광역시 구/군 단위로 주차장 목록(위치, 요금, 주차 가능 대수)을 조회한다. " +
      "대구 외 지역은 지원하지 않는다. 실시간 잔여 주차면수는 일부 주차장만 제공되므로 " +
      "제공 여부를 사용자에게 함께 알려줘라.",
    schema: z.object({
      district: z
        .enum(DAEGU_DISTRICTS)
        .describe("주차장을 조회할 대구광역시 구/군"),
    }),
  }
);
