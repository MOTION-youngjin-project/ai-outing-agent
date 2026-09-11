import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { coordinate } from "../coordinates";

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

export function parkingNumber(value: unknown): number | null {
  if (value == null || (typeof value === "string" && !value.trim()) || !["string", "number"].includes(typeof value)) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

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
  prkFcltInfo: {
    lotnoAddr: string;
    prkNocmprt: number;
    lat: number | null;
    lot: number | null;
    pkltSeCd: string | null; // 공영/민영
    pkltTypeCd: string | null; // 노상/노외/부설
    mngInstNm: string | null;
    telno: string | null;
  };
  prkOperInfo: {
    operHrWkdaySeCd: string | null; // 전일운영/시간제운영 등
    wkdayOperBgngHr: string | null; // "0900" 형식
    wkdayOperEndHr: string | null;
    crgLevySeNm: string | null;
    gnrlFrstCrgLevyHr: string | null;
    gnrlFrstCrg: number | null;
    gnrlAddCrgLevyHr: string | null;
    gnrlMntbyAddCrg: number | null;
    gnrlOneHrCrg: number | null;
    gnrlOneDayCrg: number | null;
    stlmMthd: string | null;
    rmrk: string | null;
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
  if (!res.ok || !Array.isArray(data?.data)) throw new Error("주차 API 응답 형식 오류");
  const seen = new Set<string>();
  return (data.data as ParkingItem[]).filter(i => {
    const id = i?.prkInfo?.pkltId;
    if (!id || !i.prkInfo.pkltNm || (i.prkInfo as { useYn?: string }).useYn === "N" || seen.has(id) || !i.prkFcltInfo || !i.prkOperInfo) return false;
    seen.add(id); return true;
  }).map(i => {
    const p = coordinate(i.prkFcltInfo.lat, i.prkFcltInfo.lot);
    return { ...i, prkFcltInfo: { ...i.prkFcltInfo, lat: p?.latitude ?? null, lot: p?.longitude ?? null } };
  });
}

async function fetchRealtimeOnce(pkltId: string, apiKey: string): Promise<number | null> {
  const params = new URLSearchParams({ numOfRows: "1", pageNo: "1", pkltId });
  const res = await fetch(`${REALTIME_URL}?${params}`, {
    headers: { accept: "application/json;charset=UTF-8", Authentication: apiKey },
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json();
  if (!res.ok || data?.resultCode !== "200") return null;
  const rmnd = data?.data?.[0]?.rltmPrkInfo?.totRmndPrkNocmprt;
  return parkingNumber(rmnd);
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
  const fee = parkingNumber(gnrlOneHrCrg);
  if (fee !== null) return `시간당 ${fee}원`;
  return crgLevySeNm ?? "요금정보 없음";
}

// "0900" -> "09:00"
function formatHm(hm: string | null): string | null {
  if (!hm || hm.length !== 4) return null;
  return `${hm.slice(0, 2)}:${hm.slice(2)}`;
}

export function formatOperatingHours(op: ParkingItem["prkOperInfo"]): string | null {
  if (op.operHrWkdaySeCd === "전일운영") return "24시간";
  const start = formatHm(op.wkdayOperBgngHr);
  const end = formatHm(op.wkdayOperEndHr);
  if (start && end) return `${start} - ${end}`;
  return null;
}

// 요금 상세를 목업처럼 "최초 30분 무료 / 이후 10분당 300원 / 1일 최대 6,000원" 형태의
// 여러 줄로 구성한다. 세부 필드가 없으면 formatFee의 한 줄 요약으로 대체한다.
export function formatFeeLines(op: ParkingItem["prkOperInfo"]): string[] | null {
  if (op.crgLevySeNm === "무료") return ["무료"];

  const lines: string[] = [];
  const first = parkingNumber(op.gnrlFrstCrg), additional = parkingNumber(op.gnrlMntbyAddCrg), daily = parkingNumber(op.gnrlOneDayCrg);
  if (op.gnrlFrstCrgLevyHr && first !== null) lines.push(`최초 ${op.gnrlFrstCrgLevyHr}분 ${first ? `${first.toLocaleString()}원` : "무료"}`);
  if (op.gnrlAddCrgLevyHr && additional !== null) {
    lines.push(`이후 ${op.gnrlAddCrgLevyHr}분당 ${additional.toLocaleString()}원`);
  }
  if (daily !== null) lines.push(`1일 최대 ${daily.toLocaleString()}원`);
  if (lines.length > 0) return lines;

  const fallback = formatFee(op.crgLevySeNm, op.gnrlOneHrCrg);
  return fallback === "요금정보 없음" ? null : [fallback];
}

export function formatPaymentMethod(stlmMthd: string | null): string | null {
  if (!stlmMthd) return null;
  return stlmMthd.split("+").join(", ");
}

// 지구 반지름(m) 기준 하버사인 거리. 순수 함수라 self-check로 검증한다.
export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// 평균 도보 속도 67m/분(약 4km/h) 기준. 최소 1분.
export function estimateWalkMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / 67));
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
  id: string;
  name: string;
  address: string;
  capacity: number | null;
  realtimeFetchedAt?: string | null;
  remainingSpaces: number | null;
  fee: string;
  feeLines: string[] | null;
  latitude: number | null;
  longitude: number | null;
  ownerType: string | null;
  lotType: string | null;
  operatingHours: string | null;
  paymentMethod: string | null;
  managingOrg: string | null;
  phone: string | null;
  remark: string | null;
};

// 상위 N개로 좁혀진 정적 목록에 실시간 잔여대수를 붙여 ParkingSpot으로 변환한다 —
// getDaeguParking(실시간연동 우선)과 getDaeguParkingNearby(거리 우선) 둘 다 이 마지막
// 단계는 동일해서 공유한다.
async function enrichWithRealtime(items: ParkingItem[]): Promise<ParkingSpot[]> {
  const apiKey = process.env.DAEGU_PARKING_API_KEY;
  const remainingSpacesList = apiKey
    ? await Promise.all(items.map((i) => fetchRealtimeParking(i.prkInfo.pkltId, apiKey)))
    : items.map(() => null);

  return items.map((i, idx) => ({
    id: i.prkInfo.pkltId,
    name: i.prkInfo.pkltNm,
    address: i.prkFcltInfo.lotnoAddr,
    capacity: parkingNumber(i.prkFcltInfo.prkNocmprt),
    remainingSpaces: parkingNumber(i.prkFcltInfo.prkNocmprt) !== null && remainingSpacesList[idx] !== null && remainingSpacesList[idx]! > parkingNumber(i.prkFcltInfo.prkNocmprt)! ? null : remainingSpacesList[idx],
    realtimeFetchedAt: remainingSpacesList[idx] === null ? null : new Date().toISOString(),
    fee: formatFee(i.prkOperInfo.crgLevySeNm, i.prkOperInfo.gnrlOneHrCrg),
    feeLines: formatFeeLines(i.prkOperInfo),
    latitude: i.prkFcltInfo.lat,
    longitude: i.prkFcltInfo.lot,
    ownerType: i.prkFcltInfo.pkltSeCd,
    lotType: i.prkFcltInfo.pkltTypeCd,
    operatingHours: formatOperatingHours(i.prkOperInfo),
    paymentMethod: formatPaymentMethod(i.prkOperInfo.stlmMthd),
    managingOrg: i.prkFcltInfo.mngInstNm,
    phone: i.prkFcltInfo.telno,
    remark: i.prkOperInfo.rmrk,
  }));
}

// LangChain 도구가 쓰는 조회 함수. 기준점(사용자가 실제로 서있는 위치)이 없어 거리순
// 정렬은 지원하지 않는다 — 대신 sysgrpyYn(실시간 연동 플래그)이 Y인 주차장이 실제로
// 실시간 잔여대수를 가질 확률이 훨씬 높아서(실측 확인함) 그걸 우선한다.
export async function getDaeguParking(district: string): Promise<ParkingSpot[]> {
  const sggCd = DISTRICT_CODES[district];
  if (!sggCd) return [];

  const all = await fetchParking(sggCd);
  const items = [...all]
    .sort((a, b) => Number(b.prkInfo.sysgrpyYn === "Y") - Number(a.prkInfo.sysgrpyYn === "Y"))
    .slice(0, 5);
  return enrichWithRealtime(items);
}

// /api/parking 라우트가 쓰는 조회 함수 — 목적지 좌표가 있을 때는 실시간 연동 여부와
// 무관하게 실제로 가장 가까운 곳을 고른다. 2026-09-08 실측: getDaeguParking처럼
// "실시간연동 우선, 그 안에서 원본 API 순서"로 5개를 뽑으면 그 순서가 위치와 무관해서
// 5~6km 떨어진 곳이 뽑히는 문제가 있었음(대구미술관 기준 실제로 재현) — 화면에 이미
// "거리순"이라고 표시하고 있으니 실제 동작도 그래야 한다. 실시간 데이터 없는 곳은
// remainingSpaces가 null로 남고 UI가 이미 그 경우를 처리한다.
export async function getDaeguParkingNearby(
  district: string,
  origin: { latitude: number; longitude: number }
): Promise<ParkingSpot[]> {
  const sggCd = DISTRICT_CODES[district];
  if (!sggCd) return [];

  const all = await fetchParking(sggCd);
  const items = all
    .filter((i): i is ParkingItem & { prkFcltInfo: { lat: number; lot: number } } =>
      i.prkFcltInfo.lat !== null && i.prkFcltInfo.lot !== null
    )
    .sort(
      (a, b) =>
        haversineMeters(origin, { latitude: a.prkFcltInfo.lat, longitude: a.prkFcltInfo.lot }) -
        haversineMeters(origin, { latitude: b.prkFcltInfo.lat, longitude: b.prkFcltInfo.lot })
    )
    .slice(0, 5);
  return enrichWithRealtime(items);
}

// /주차장/[pkltId] 상세 라우트의 새로고침/직링크 복원용. getDaeguParking(Nearby)는 상위
// 5개로 자른 뒤라 그 밖의 pkltId는 못 찾는다 — 여긴 자르기 전 전체 목록에서 찾는다.
export async function getParkingSpotById(
  district: string,
  pkltId: string,
  origin?: { latitude: number; longitude: number } | null
): Promise<(ParkingSpot & { distanceMeters: number | null; walkMinutes: number | null }) | null> {
  const sggCd = DISTRICT_CODES[district];
  if (!sggCd) return null;

  const all = await fetchParking(sggCd);
  const item = all.find((i) => i.prkInfo.pkltId === pkltId);
  if (!item) return null;

  const [spot] = await enrichWithRealtime([item]);
  if (!origin || spot.latitude === null || spot.longitude === null) {
    return { ...spot, distanceMeters: null, walkMinutes: null };
  }
  const distanceMeters = Math.round(haversineMeters(origin, { latitude: spot.latitude, longitude: spot.longitude }));
  return { ...spot, distanceMeters, walkMinutes: estimateWalkMinutes(distanceMeters) };
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
