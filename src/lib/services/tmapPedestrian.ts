// Tmap(SK Open API) 보행자 경로안내 연동 — 네이버 NCP/카카오모빌리티 둘 다 도보
// 턴바이턴 안내문구 자체가 없어서(docs/research/turn-by-turn-navigation-and-congestion-data-sources.md)
// 이것만 쓴다. 응답은 GeoJSON FeatureCollection — Point(경유/시작/도착 지점, 안내문구
// 있음) + LineString(구간 폴리라인·거리·시간) 피처가 순서대로 섞여 있다.
const PEDESTRIAN_URL = "https://apis.openapi.sk.com/tmap/routes/pedestrian";

export type WalkingStep = {
  latitude: number;
  longitude: number;
  description: string; // 예: "대봉55에서 좌회전 후 대봉로를 따라 27m 이동"
  turnType: number;
  // 이 스텝에서 다음 스텝까지 구간(LineString)의 실측 거리/시간 — 마지막 스텝(도착)엔 없음.
  distanceToNextM: number | null;
  timeToNextSec: number | null;
};

export type WalkingRoute = {
  totalDistanceM: number;
  totalTimeSec: number;
  steps: WalkingStep[];
  path: { latitude: number; longitude: number }[];
};

type TmapFeature = {
  type: "Feature";
  geometry: { type: "Point" | "LineString"; coordinates: number[] | number[][] };
  properties: Record<string, unknown>;
};

export async function fetchWalkingRoute(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): Promise<WalkingRoute | null> {
  const appKey = process.env.TMAP_APP_KEY;
  if (!appKey) return null;

  const res = await fetch(`${PEDESTRIAN_URL}?version=1`, {
    method: "POST",
    headers: { appKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      startX: String(from.longitude),
      startY: String(from.latitude),
      endX: String(to.longitude),
      endY: String(to.latitude),
      startName: "start",
      endName: "end",
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { features?: TmapFeature[] };
  const features = data.features ?? [];

  const points = features.filter((f) => f.geometry.type === "Point");
  const lines = features.filter((f) => f.geometry.type === "LineString");
  if (points.length === 0) return null;

  const first = points[0].properties;
  const totalDistanceM = Number(first.totalDistance ?? 0);
  const totalTimeSec = Number(first.totalTime ?? 0);

  const steps: WalkingStep[] = points.map((p, i) => {
    const [lng, lat] = p.geometry.coordinates as number[];
    const line = lines[i]; // i번째 지점 다음 구간 — Tmap 응답이 Point, LineString 교대로 옴
    return {
      latitude: lat,
      longitude: lng,
      description: String(p.properties.description ?? ""),
      turnType: Number(p.properties.turnType ?? 0),
      distanceToNextM: line ? Number(line.properties.distance ?? 0) : null,
      timeToNextSec: line ? Number(line.properties.time ?? 0) : null,
    };
  });

  const path = lines.flatMap((l) =>
    (l.geometry.coordinates as number[][]).map(([lng, lat]) => ({ latitude: lat, longitude: lng }))
  );

  return { totalDistanceM, totalTimeSec, steps, path };
}
