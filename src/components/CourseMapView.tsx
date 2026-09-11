"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchDrivingDirections, type PlaceWithMeta } from "@/lib/clientApi";
import { NaverMap, type MapParkingSpot } from "@/components/NaverMap";
import { CourseStopList } from "@/components/CourseStopList";

// 코스를 지도(번호 핀 + 구간 폴리라인) + 정류지 목록으로 보여주는 본문. 지도 탭(MapScreen)과
// 저장한 코스 다시 보기(SavedCourseScreen)가 같은 화면을 쓰기 때문에 따로 뺐다.
// cacheKey: 구간 경로 요청 캐시 키 — 추천 런 id나 저장한 코스 id처럼 코스를 구분하는 값.
export function CourseMapView({
  places,
  runId,
  cacheKey,
  listHeading,
}: {
  places: PlaceWithMeta[];
  runId: string | null;
  cacheKey: string;
  listHeading?: string;
}) {
  const withCoords = places.filter(
    (p): p is typeof p & { latitude: number; longitude: number } => p.latitude != null && p.longitude != null
  );

  // 코스 구간별 실제 도로 경로(폴리라인)를 정류지 좌표 쌍마다 따로 요청해서 이어붙인다.
  // 서버가 코스 계산 때 구간별 거리/시간(travelDurationMin)은 이미 저장해두지만
  // 좌표 배열(path)까지는 저장하지 않아서(용량 문제, DirectionsScreen 참고) 여기서 새로 받는다.
  const legsQuery = useQuery({
    queryKey: ["map-route", cacheKey, withCoords.map((p) => p.placeId ?? p.name).join(",")],
    queryFn: async () => {
      const legs = await Promise.all(
        withCoords.slice(0, -1).map((from, i) => {
          const to = withCoords[i + 1];
          return fetchDrivingDirections(
            { latitude: from.latitude, longitude: from.longitude },
            { latitude: to.latitude, longitude: to.longitude }
          );
        })
      );
      return legs.map((routes) => routes.find((r) => r.option === "trafast") ?? routes[0] ?? null);
    },
    enabled: withCoords.length > 1,
  });

  const routePath = (legsQuery.data ?? []).flatMap((leg) => leg?.path ?? []);
  const spots: MapParkingSpot[] = withCoords.map((p, i) => ({
    id: p.placeId ?? `${i}`,
    name: p.name,
    latitude: p.latitude,
    longitude: p.longitude,
    walkMinutes: null,
    order: i + 1,
  }));

  return (
    <>
      {withCoords.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-2xl bg-slate-100 text-[13px] text-muted">
          좌표가 확인된 장소가 없어 지도를 표시할 수 없어요.
        </div>
      ) : (
        <NaverMap
          center={{ latitude: withCoords[0].latitude, longitude: withCoords[0].longitude }}
          spots={spots}
          routePath={routePath.length > 1 ? routePath : undefined}
          className="relative h-72 w-full overflow-hidden rounded-2xl"
        />
      )}

      {listHeading && <h2 className="px-1 text-[15px] font-bold text-ink">{listHeading}</h2>}
      <CourseStopList places={places} runId={runId} />
    </>
  );
}
