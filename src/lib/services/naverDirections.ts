// 네이버 클라우드 플랫폼 Direction 15(자동차 길찾기) 연동.
// https://api.ncloud-docs.com/docs/ai-naver-mapsdirections-driving
// 지도(Dynamic Map)와 같은 Maps 콘솔 키 쌍을 그대로 쓴다
// (NEXT_PUBLIC_NAVER_MAP_CLIENT_ID / NAVER_MAP_CLIENT_SECRET).
const DIRECTIONS_URL = "https://maps.apigw.ntruss.com/map-direction-15/v1/driving";

export type DrivingLeg = { distanceM: number; durationMin: number };

export type GeoPoint = { latitude: number; longitude: number };
export type DrivingRoute = DrivingLeg & { option: string; path: GeoPoint[] };

// 길찾기 화면(폴리라인 렌더링)용 — fetchDrivingRoute와 달리 좌표 배열(path)까지 받는다.
// 코스 구간별 이동시간 계산(fetchDrivingRoute)은 매 구간마다 불려서 path까지 받으면
// 응답/DB 저장 용량만 커지므로 그대로 두고, 이 함수는 화면에서 필요할 때만 따로 호출한다.
// option을 콜론(:)으로 여러 개 넘기면 route에 옵션별 키가 각각 담겨 온다(NCP 응답 실측
// 확인 — 문서에 명시 안 돼 있음). 거리가 가까운 구간은 옵션이 달라도 같은 길로 수렴해
// 응답 route에 실제로는 한 키만 오는 경우도 있다 — 있는 만큼만 돌려준다.
export async function fetchDrivingRoutes(from: GeoPoint, to: GeoPoint): Promise<DrivingRoute[]> {
  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const clientSecret = process.env.NAVER_MAP_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  const params = new URLSearchParams({
    start: `${from.longitude},${from.latitude}`,
    goal: `${to.longitude},${to.latitude}`,
    option: "trafast:tracomfort",
  });

  try {
    const res = await fetch(`${DIRECTIONS_URL}?${params}`, {
      headers: {
        "x-ncp-apigw-api-key-id": clientId,
        "x-ncp-apigw-api-key": clientSecret,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];

    const data = await res.json();
    const route = data?.route as Record<string, { summary?: { distance: number; duration: number }; path?: [number, number][] }[]> | undefined;
    if (!route) return [];

    return Object.entries(route)
      .map(([option, entries]) => {
        const entry = entries?.[0];
        if (!entry?.summary || !entry.path) return null;
        return {
          option,
          distanceM: Math.round(entry.summary.distance),
          durationMin: Math.round(entry.summary.duration / 60000),
          path: entry.path.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
        };
      })
      .filter((r): r is DrivingRoute => r !== null);
  } catch (err) {
    console.error("네이버 Directions(경로) 호출 실패:", err);
    return [];
  }
}

// 실패해도(쿼터/네트워크/좌표 없음) 코스 자체는 살려야 한다 — 이 구간 하나만
// 이동시간 배지가 안 뜨는 것으로 취급하고 null을 돌려준다(throw 안 함).
export async function fetchDrivingRoute(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): Promise<DrivingLeg | null> {
  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const clientSecret = process.env.NAVER_MAP_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const params = new URLSearchParams({
    start: `${from.longitude},${from.latitude}`,
    goal: `${to.longitude},${to.latitude}`,
    option: "trafast",
  });

  try {
    const res = await fetch(`${DIRECTIONS_URL}?${params}`, {
      headers: {
        "x-ncp-apigw-api-key-id": clientId,
        "x-ncp-apigw-api-key": clientSecret,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const summary = data?.route?.trafast?.[0]?.summary;
    if (!summary) return null;

    return {
      distanceM: Math.round(summary.distance),
      durationMin: Math.round(summary.duration / 60000),
    };
  } catch (err) {
    console.error("네이버 Directions 호출 실패:", err);
    return null;
  }
}
