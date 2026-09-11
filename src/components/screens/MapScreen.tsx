"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { fetchDrivingDirections, type RecommendResult } from "@/lib/clientApi";
import { NaverMap, type MapParkingSpot } from "@/components/NaverMap";
import { CourseStopList } from "@/components/CourseStopList";
import { Icon } from "@/components/Icon";
import { SidebarToggleButton } from "@/components/SidebarToggleButton";

// 디자인/지도.png: 코스 전체를 지도 위 번호 핀+구간별 폴리라인으로 보여주고, 그 아래
// 기존 코스 리스트(CourseStopList)를 그대로 이어붙인다. 총 소요시간/예상비용
// 요약바는 백엔드에 합산 필드가 없어(장소별 자유텍스트뿐) 넣지 않는다 — 지어내지 않는다.
export function MapScreen({ recommendation, runId }: { recommendation: RecommendResult; runId: string }) {
  const router = useRouter();
  const places = recommendation.places ?? [];
  const withCoords = places.filter(
    (p): p is typeof p & { latitude: number; longitude: number } => p.latitude != null && p.longitude != null
  );

  // 코스 구간별 실제 도로 경로(폴리라인)를 정류지 좌표 쌍마다 따로 요청해서 이어붙인다.
  // 서버가 코스 계산 때 구간별 거리/시간(travelDurationMin)은 이미 저장해두지만
  // 좌표 배열(path)까지는 저장하지 않아서(용량 문제, DirectionsScreen 참고) 여기서 새로 받는다.
  const legsQuery = useQuery({
    queryKey: ["map-route", runId, withCoords.map((p) => p.placeId ?? p.name).join(",")],
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
      <div className="flex items-center justify-between px-5 pb-1 pt-5">
        <SidebarToggleButton />
        <button
          onClick={() => router.push("/")}
          aria-label="새 질문"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink shadow-[0_1px_3px_rgba(17,24,39,0.05)]"
        >
          <Icon name="plus" className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-3 px-5">
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

        <h2 className="px-1 text-[15px] font-bold text-ink">오늘의 추천 코스</h2>
        <CourseStopList places={places} runId={runId} />
      </div>
    </>
  );
}
