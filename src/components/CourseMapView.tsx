"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchDrivingDirections, type PlaceWithMeta } from "@/lib/clientApi";
import { NaverMap, type MapParkingSpot } from "@/components/NaverMap";
import { CourseStopList } from "@/components/CourseStopList";
import { CurrentLegView } from "@/components/CurrentLegView";
import { ExternalMapMenu } from "@/components/ExternalMapMenu";
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
  // 핀 id는 "places 안의 순서"로 만든다 — 예전엔 좌표 있는 것만 거른 배열의 순서를
  // 써서, 좌표 없는 장소가 끼어 있으면 핀과 목록이 한 칸씩 어긋났다.
  const spotId = (p: PlaceWithMeta, i: number) => p.placeId ?? `${i}`;
  const withCoords = places
    .map((p, i) => ({ p, i }))
    .filter(
      (x): x is { p: PlaceWithMeta & { latitude: number; longitude: number }; i: number } =>
        x.p.latitude != null && x.p.longitude != null
    );

  // 코스 구간별 실제 도로 경로(폴리라인)를 정류지 좌표 쌍마다 따로 요청해서 이어붙인다.
  // 서버가 코스 계산 때 구간별 거리/시간(travelDurationMin)은 이미 저장해두지만
  // 좌표 배열(path)까지는 저장하지 않아서(용량 문제, DirectionsScreen 참고) 여기서 새로 받는다.
  const legsQuery = useQuery({
    queryKey: ["map-route", cacheKey, withCoords.map(({ p }) => p.placeId ?? p.name).join(",")],
    queryFn: async () => {
      const legs = await Promise.all(
        withCoords.slice(0, -1).map(({ p: from }, i) => {
          const to = withCoords[i + 1].p;
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
  const spots: MapParkingSpot[] = withCoords.map(({ p, i }) => ({
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
  //
  // 선택·현재 구간 상태는 주소(?stop=N, &leg=1)에 둔다 — 로컬 state였을 때는
  //  - 선택 카드에서 장소 상세로 갔다가 뒤로 오면 선택이 풀려 있었고,
  //  - "이 코스로 출발"로 1번 장소가 선택된 채 열 방법이 없었고,
  //  - 현재 구간에서 하드웨어 뒤로를 누르면 지도 탭 자체를 떠났다.
  // 핀끼리 옮겨 다니는 건 replace(히스토리를 쌓지 않음), 구간 화면에 들어가는 것만
  // push다 — 그래서 구간 화면의 뒤로는 선택 카드로 한 단계만 돌아간다.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const stop = Number(searchParams.get("stop"));
  const selectedIndex = Number.isInteger(stop) && stop >= 1 && stop <= places.length ? stop - 1 : -1;
  const selectedPlace = selectedIndex >= 0 ? places[selectedIndex] : null;
  const prevPlace = selectedIndex > 0 ? places[selectedIndex - 1] : null;
  const selectedId = selectedPlace ? spotId(selectedPlace, selectedIndex) : null;

  // "현재 구간 보기"(디자인/지도(현재구간).png)는 핀 선택 카드 위에 얹히는 세 번째 상태다.
  // 이전 장소가 있어야만(맨 처음 장소는 "현재 구간"이 없음) 켤 수 있다.
  const legActive = searchParams.get("leg") === "1" && !!prevPlace;
  // 이 화면에서 구간으로 들어간 거면(push) 뒤로 = 브라우저 back. 새로고침 등으로
  // 구간 주소에서 바로 시작했으면 back할 곳이 없으니 선택 카드 주소로 바꾼다.
  const pushedLeg = useRef(false);

  function hrefFor(index: number | null, leg = false) {
    if (index === null) return pathname;
    return `${pathname}?stop=${index + 1}${leg ? "&leg=1" : ""}`;
  }
  function selectIndex(index: number | null) {
    router.replace(hrefFor(index), { scroll: false });
  }
  function selectById(id: string) {
    const index = places.findIndex((p, i) => spotId(p, i) === id);
    selectIndex(index >= 0 ? index : null);
  }
  function startLeg() {
    pushedLeg.current = true;
    router.push(hrefFor(selectedIndex, true), { scroll: false });
  }
  function backFromLeg() {
    if (pushedLeg.current) {
      pushedLeg.current = false;
      router.back();
    } else {
      router.replace(hrefFor(selectedIndex), { scroll: false });
    }
  }

  // "전체 코스 보기"는 선택 카드로 한 단계만 돌아가는 게 아니라 목록까지 다 닫는다 —
  // 버튼 이름 그대로 전체 코스를 보여준다.
  function closeLeg() {
    pushedLeg.current = false;
    router.replace(pathname, { scroll: false });
  }

  function advanceLeg() {
    const nextIndex = selectedIndex + 1;
    if (nextIndex < places.length) {
      // 구간 화면은 켜진 채로 다음 구간으로 — 다음 장소도 이전 장소(방금 도착한 곳)가 있다.
      // push라서 뒤로(버튼·하드웨어 모두)는 바로 앞 구간으로 한 단계씩 돌아간다.
      pushedLeg.current = true;
      router.push(hrefFor(nextIndex, true), { scroll: false });
    } else {
      closeLeg();
    }
  }

  return (
    <>
      {withCoords.length === 0 ? (
        <div className="sk-panel flex h-64 items-center justify-center text-[13px] text-muted">
          좌표가 확인된 장소가 없어 지도를 표시할 수 없어요.
        </div>
      ) : legActive && selectedPlace && prevPlace ? null : (
        <NaverMap
          center={{ latitude: withCoords[0].p.latitude, longitude: withCoords[0].p.longitude }}
          spots={spots}
          routePath={routePath.length > 1 ? routePath : undefined}
          className="sk-panel relative h-72 w-full overflow-hidden p-0"
          selectedId={selectedId}
          onSelect={selectById}
        />
      )}

      {legActive && selectedPlace && prevPlace ? (
        <CurrentLegView
          from={prevPlace}
          to={selectedPlace}
          fromLabel={`${selectedIndex}번째`}
          toLabel={`${selectedIndex + 1}번째`}
          advanceLabel={selectedIndex + 1 < places.length ? "다음 장소로" : "코스 마치기"}
          onAdvance={advanceLeg}
          onBack={backFromLeg}
          onClose={closeLeg}
        />
      ) : selectedPlace ? (
        <SelectedStopCard
          place={selectedPlace}
          index={selectedIndex}
          prevPlace={prevPlace}
          runId={runId}
          onClose={() => selectIndex(null)}
          onStartLeg={startLeg}
        />
      ) : (
        <>
          {listHeading && <h2 className="sk-cap text-[15px] font-bold text-ink">{listHeading}</h2>}
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
  onStartLeg,
}: {
  place: PlaceWithMeta;
  index: number;
  prevPlace: PlaceWithMeta | null;
  runId: string | null;
  onClose: () => void;
  onStartLeg: () => void;
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
        {/* 첫 장소는 "현재 구간"(이전 장소→여기)이 없다. 예전엔 버튼을 회색으로만
            두었는데, "이 코스로 출발"이 여기로 오면서 첫 장소가 곧 출발점이 됐다 —
            여기까지 가는 외부 지도앱 길찾기를 그 자리에 둔다. */}
        {prevPlace ? (
          <button
            onClick={onStartLeg}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent py-2 text-[13px] font-semibold text-white"
          >
            <Icon name="arrowUpRight" className="h-3.5 w-3.5" />
            현재 구간 보기
          </button>
        ) : place.latitude != null && place.longitude != null ? (
          <ExternalMapMenu
            latitude={place.latitude}
            longitude={place.longitude}
            name={place.name}
            label="여기까지 길찾기"
            icon="arrowUpRight"
            popupAbove
            className="flex-1"
            summaryClassName="flex list-none items-center justify-center gap-1.5 rounded-full bg-accent py-2 text-[13px] font-semibold text-white marker:content-none"
          />
        ) : (
          <span className="flex flex-1 items-center justify-center rounded-full bg-slate-100 py-2 text-[13px] font-semibold text-slate-400">
            위치 정보 없음
          </span>
        )}
      </div>
    </div>
  );
}
