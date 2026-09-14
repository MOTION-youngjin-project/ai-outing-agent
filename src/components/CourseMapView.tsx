"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchDrivingDirections, type PlaceWithMeta } from "@/lib/clientApi";
import { NaverMap, type MapParkingSpot } from "@/components/NaverMap";
import { CourseStopList } from "@/components/CourseStopList";
import { Icon } from "@/components/Icon";
import { extractCategoryLabel } from "@/lib/services/matching";
import { WALK_DISTANCE_THRESHOLD_M, estimateWalkMinutes } from "@/lib/travelMode";

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
  const spotId = (p: PlaceWithMeta, i: number) => p.placeId ?? `${i}`;
  const spots: MapParkingSpot[] = withCoords.map((p, i) => ({
    id: spotId(p, i),
    name: p.name,
    latitude: p.latitude,
    longitude: p.longitude,
    walkMinutes: null,
    order: i + 1,
  }));

  // 지도 위 번호 핀을 탭하면(디자인/지도/장소 핀 선택.png) 전체 목록 대신 그 장소 하나의
  // 카드로 바꿔 보여준다. NaverMap의 selectedId/onSelect는 주차장 목록 화면에서 이미
  // 쓰던 제어형 선택 메커니즘을 그대로 재사용한다.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIndex = places.findIndex((p, i) => spotId(p, i) === selectedId);
  const selectedPlace = selectedIndex >= 0 ? places[selectedIndex] : null;
  const prevPlace = selectedIndex > 0 ? places[selectedIndex - 1] : null;

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
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}

      {selectedPlace ? (
        <SelectedStopCard
          place={selectedPlace}
          index={selectedIndex}
          prevPlace={prevPlace}
          runId={runId}
          onClose={() => setSelectedId(null)}
        />
      ) : (
        <>
          {listHeading && <h2 className="px-1 text-[15px] font-bold text-ink">{listHeading}</h2>}
          <CourseStopList places={places} runId={runId} />
        </>
      )}
    </>
  );
}

function SelectedStopCard({
  place,
  index,
  prevPlace,
  runId,
  onClose,
}: {
  place: PlaceWithMeta;
  index: number;
  prevPlace: PlaceWithMeta | null;
  runId: string | null;
  onClose: () => void;
}) {
  const categoryLabel = extractCategoryLabel(place.category ?? null);
  const detailHref =
    place.placeId && (runId ? `/recommend/${runId}/place/${place.placeId}` : `/place/${place.placeId}`);

  return (
    <div className="rounded-2xl bg-white p-3 shadow-[0_1px_3px_rgba(17,24,39,0.06)]">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          {place.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- 외부 공공데이터 이미지, 도메인 사전등록 불필요한 일반 img로 처리
            <img src={place.imageUrl} alt={place.name} className="h-16 w-16 rounded-xl object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-mint-soft">
              <Icon name="pin" className="h-6 w-6 text-mint-mid" />
            </div>
          )}
          <span className="absolute -left-1 -top-1 rounded-full bg-cta px-1.5 py-0.5 text-[10px] font-bold text-white">
            {index + 1}번째 코스
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-[16px] font-bold text-ink">{place.name}</h3>
            <button onClick={onClose} aria-label="선택 해제" className="shrink-0 text-slate-300">
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
          {categoryLabel && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-mint-bg px-2 py-0.5 text-[11px] font-medium text-accent">
              <Icon name="walk" className="h-3 w-3" />
              {categoryLabel}
            </span>
          )}
        </div>
      </div>

      {place.oneLineDescription && (
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{place.oneLineDescription}</p>
      )}

      {(place.visitDuration || place.fee) && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 text-[12px] text-muted">
          {place.visitDuration && <span>{place.visitDuration}</span>}
          {place.fee && <span>{place.fee}</span>}
        </div>
      )}

      {prevPlace && place.travelDistanceM != null && (
        <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-page px-3 py-2.5 text-[12px] text-ink-soft">
          <Icon
            name={place.travelDistanceM < WALK_DISTANCE_THRESHOLD_M ? "walk" : "car"}
            className="h-4 w-4 shrink-0 text-muted"
          />
          <span className="flex-1">
            이전 장소에서{" "}
            {place.travelDistanceM < WALK_DISTANCE_THRESHOLD_M
              ? `도보로 약 ${estimateWalkMinutes(place.travelDistanceM)}분`
              : `차량으로 약 ${place.travelDurationMin}분`}{" "}
            거리예요.
          </span>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {detailHref ? (
          <Link
            href={detailHref}
            className="flex-1 rounded-full border border-hairline py-2 text-center text-[13px] font-medium text-ink-soft"
          >
            상세 보기
          </Link>
        ) : (
          <span className="flex-1 rounded-full border border-hairline py-2 text-center text-[13px] font-medium text-slate-300">
            상세 보기
          </span>
        )}
        {/* 실시간 턴바이턴 내비게이션은 별도 기능으로 미룸(다음 작업) — 그때까지는
            준비 중으로 비활성 표시. */}
        <button
          disabled
          title="준비 중인 기능입니다"
          className="flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-full bg-slate-100 py-2 text-[13px] font-semibold text-slate-400"
        >
          <Icon name="arrowUpRight" className="h-3.5 w-3.5" />
          현재 구간 보기
        </button>
      </div>
    </div>
  );
}
