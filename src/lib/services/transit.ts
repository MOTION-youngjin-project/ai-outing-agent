// Transitous(공개 오픈소스 대중교통 길찾기, MOTIS 엔진) 연동.
// https://transitous.org/api/ — 인증키 없음, User-Agent 헤더만 필수.
// 2026-09-09 실측: 한국 데이터(KTDB 전국 GTFS + 코레일) 실제로 대구/서울/부산/광주
// 버스·지하철·기차 응답 확인함(docs/research/other-team-api-stack-evaluation.md).
const TRANSITOUS_URL = "https://api.transitous.org/api/v6/plan";
const USER_AGENT = "ai-outing-agent/1.0 (school capstone project, Daegu outing recommendation app)";

// 이 GTFS 피드에서 대구·광주 시내버스가 실제로는 "TRAM"(노면전차) 타입으로 들어와 있다
// (노선번호가 "401", "수성4", "160"처럼 버스 번호 형식이라 확인 — 한국엔 운행 중인 노면전차가
// 없음, 데이터 입력 방식의 특성으로 추정). 사용자에게 혼란을 주지 않도록 버스로 표시한다.
const MODE_LABELS: Record<string, string> = {
  WALK: "도보",
  BUS: "버스",
  TRAM: "버스",
  SUBWAY: "지하철",
  RAIL: "기차",
  LONG_DISTANCE: "기차",
};

type TransitousLeg = {
  mode: string;
  from: { name: string };
  to: { name: string };
  routeShortName?: string;
  headsign?: string;
  duration?: number;
};

type TransitousItinerary = {
  duration: number;
  transfers: number;
  legs: TransitousLeg[];
};

export type TransitLeg = {
  mode: string;
  modeLabel: string;
  from: string;
  to: string;
  routeShortName: string | null;
  headsign: string | null;
};

export type TransitItinerary = {
  durationMin: number;
  transfers: number;
  legs: TransitLeg[];
};

export async function fetchTransitDirections(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): Promise<TransitItinerary[]> {
  const params = new URLSearchParams({
    fromPlace: `${from.latitude},${from.longitude}`,
    toPlace: `${to.latitude},${to.longitude}`,
  });

  const res = await fetch(`${TRANSITOUS_URL}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`Transitous API 오류(${res.status})`);

  const data = await res.json();
  const itineraries: TransitousItinerary[] = data?.itineraries ?? [];

  // 도보만 있는 경로(대중교통 구간이 하나도 없음)는 "대중교통 경로"로서 의미가 없어 제외.
  return itineraries
    .filter((it) => it.legs.some((leg) => leg.mode !== "WALK"))
    .slice(0, 3)
    .map((it) => ({
      durationMin: Math.round(it.duration / 60),
      transfers: it.transfers,
      legs: it.legs.map((leg) => ({
        mode: leg.mode,
        modeLabel: MODE_LABELS[leg.mode] ?? leg.mode,
        from: leg.from.name,
        to: leg.to.name,
        routeShortName: leg.routeShortName ?? null,
        headsign: leg.headsign ?? null,
      })),
    }));
}
