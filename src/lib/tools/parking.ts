import { tool } from "@langchain/core/tools";
import { z } from "zod";

// 대구광역시 통합주차정보시스템 - 민간주차장 API(주차장정보 조회)
// https://pis.daegu.go.kr/api/mingan/prkInfo
// 대구광역시 관할 구/군 단위로만 조회 가능. 인증은 쿼리스트링이 아니라 Authentication 헤더.
const PARKING_URL = "https://pis.daegu.go.kr/api/mingan/prkInfo";

export const DAEGU_DISTRICTS = [
  "중구", "동구", "서구", "남구", "북구", "수성구", "달서구", "달성군", "군위군",
] as const;

export const DAEGU_DISTRICT_CODES: Record<string, string> = {
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

export type ParkingItem = {
  prkInfo: { pkltId: string; pkltNm: string; sysgrpyYn: string; useYn: string };
  prkFcltInfo: {
    lat: number | string;
    lot: number | string;
    lotnoAddr: string;
    roadNmAddr: string | null;
    prkNocmprt: number;
  };
  prkOperInfo: {
    crgLevySeNm: string | null;
    gnrlOneHrCrg: number | null;
    wkdayOperBgngHr: string | null;
    wkdayOperEndHr: string | null;
    satOperBgngHr: string | null;
    satOperEndHr: string | null;
    lhldyOperBgngHr: string | null;
    lhldyOperEndHr: string | null;
  };
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

export function formatFee(crgLevySeNm: string | null, gnrlOneHrCrg: number | null): string {
  if (crgLevySeNm === "무료") return "무료";
  if (gnrlOneHrCrg) return `시간당 ${gnrlOneHrCrg}원`;
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
  fee: string;
  hasRealtime: boolean;
};

export type ParkingOption = ParkingSpot & {
  distanceM: null;
  walkingMinutes: null;
  selectionBasis: "same_district_score";
};

// 지도 좌표가 없는 동안 사용할 임시 우선순위다. 가까운 순서는 아니며,
// 무료 여부 > 실시간 정보 제공 > 주차 규모 순으로 안정적으로 정렬한다.
export function parkingScore(spot: ParkingSpot): number {
  const freeScore = spot.fee === "무료" ? 10_000 : 0;
  const realtimeScore = spot.hasRealtime ? 1_000 : 0;
  return freeScore + realtimeScore + Math.min(Math.max(spot.capacity, 0), 999);
}

export function rankParkingSpots(spots: ParkingSpot[], limit = 3): ParkingSpot[] {
  return [...spots]
    .sort((a, b) => parkingScore(b) - parkingScore(a) || a.name.localeCompare(b.name, "ko"))
    .slice(0, limit);
}

// LangChain 도구와 /api/parking 라우트가 공유하는 구조화된 조회 함수.
// 좌표는 API가 주지만 기준점(사용자가 실제로 서있는 위치)이 없어 거리순 정렬은 지원하지 않는다.
export async function getDaeguParking(district: string, limit = 5): Promise<ParkingSpot[]> {
  const sggCd = DAEGU_DISTRICT_CODES[district];
  if (!sggCd) return [];

  const items = await fetchParking(sggCd);
  const spots = items.map((i) => ({
    name: i.prkInfo.pkltNm,
    address: i.prkFcltInfo.lotnoAddr,
    capacity: i.prkFcltInfo.prkNocmprt,
    fee: formatFee(i.prkOperInfo.crgLevySeNm, i.prkOperInfo.gnrlOneHrCrg),
    hasRealtime: i.prkInfo.sysgrpyYn === "Y",
  }));
  return rankParkingSpots(spots, limit);
}

export async function getParkingOptions(district: string): Promise<ParkingOption[]> {
  const spots = await getDaeguParking(district, 3);
  return spots.map((spot) => ({
    ...spot,
    distanceM: null,
    walkingMinutes: null,
    selectionBasis: "same_district_score",
  }));
}

export async function fetchParkingByDistrict(district: string) {
  const code = DAEGU_DISTRICT_CODES[district];
  if (!code) throw new Error("지원하지 않는 대구광역시 구·군입니다.");
  return fetchParking(code);
}

export const parkingTool = tool(
  async ({ district }) => {
    const sggCd = DAEGU_DISTRICT_CODES[district];
    if (!sggCd) {
      return `"${district}"은(는) 대구광역시 구/군이 아닙니다. 이 도구는 대구광역시(중구·동구·서구·남구·북구·수성구·달서구·달성군·군위군) 내 주차장만 조회 가능합니다.`;
    }

    try {
      const spots = await getDaeguParking(district);
      if (spots.length === 0) return `${district}에 등록된 주차장 정보를 찾을 수 없습니다.`;

      const list = spots
        .map((s) => {
          const realtime = s.hasRealtime ? "실시간 잔여면수 제공" : "실시간 정보 없음";
          return `- ${s.name} (${s.address}, 주차구획 ${s.capacity}면, ${s.fee}, ${realtime})`;
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
