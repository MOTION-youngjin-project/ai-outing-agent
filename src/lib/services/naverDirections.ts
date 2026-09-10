// 네이버 클라우드 플랫폼 Direction 15(자동차 길찾기) 연동.
// https://api.ncloud-docs.com/docs/ai-naver-mapsdirections-driving
// 지도(Dynamic Map)와 같은 Maps 콘솔 키 쌍을 그대로 쓴다
// (NEXT_PUBLIC_NAVER_MAP_CLIENT_ID / NAVER_MAP_CLIENT_SECRET).
const DIRECTIONS_URL = "https://maps.apigw.ntruss.com/map-direction-15/v1/driving";

export type DrivingLeg = { distanceM: number; durationMin: number };

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
