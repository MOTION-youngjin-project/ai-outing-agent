"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchWalkingRoute, fetchWeather, type PlaceWithMeta } from "@/lib/clientApi";
import { haversineMeters } from "@/lib/tools/parking";
import { useAppStore } from "@/lib/store";
import { NaverMap, type MapParkingSpot } from "@/components/NaverMap";
import { Icon } from "@/components/Icon";
import { ExternalMapMenu } from "@/components/ExternalMapMenu";
import { WALK_DISTANCE_THRESHOLD_M } from "@/lib/travelMode";

// 디자인/지도(현재구간).png의 실시간 도보 내비게이션. 턴바이턴 안내문구는 Tmap
// 보행자 경로안내로만 가능하다(docs/research/turn-by-turn-navigation-and-congestion-data-sources.md
// — 네이버 NCP는 도보 옵션 자체가 없고 카카오모빌리티 도보 API는 안내문구 필드가 없음).
// 혼잡도는 같은 조사에서 대구를 정직하게 커버하는 소스가 없다고 결론 나서 이 화면엔 없다.
export function CurrentLegView({
  from,
  to,
  fromLabel,
  toLabel,
  onAdvance,
  advanceLabel,
  onBack,
  onClose,
}: {
  from: PlaceWithMeta;
  to: PlaceWithMeta;
  fromLabel: string;
  toLabel: string;
  onAdvance: () => void;
  advanceLabel: string;
  // 헤더의 뒤로 — 선택 카드로 한 단계 돌아간다(하드웨어 뒤로와 같다).
  onBack: () => void;
  // "전체 코스 보기" — 선택까지 풀고 코스 전체로.
  onClose: () => void;
}) {
  // 걸어갈 거리인지 — 코스 목록의 도보/차량 구분(CourseStopList)과 같은 기준이다.
  // 예전엔 차량 30분 구간에서도 도보 경로와 걷기 턴 안내를 띄웠다. 멀면 도보 안내 대신
  // 차량 기준 요약과 외부 지도앱 길찾기를 보여준다.
  const isWalk = to.travelDistanceM != null && to.travelDistanceM < WALK_DISTANCE_THRESHOLD_M;
  const hasCoords = from.latitude != null && from.longitude != null && to.latitude != null && to.longitude != null;
  const regionId = useAppStore((s) => s.regionId);
  const weatherQuery = useQuery({
    queryKey: ["weather", regionId],
    queryFn: () => fetchWeather(regionId),
    enabled: !!regionId,
  });

  const routeQuery = useQuery({
    queryKey: ["walking-leg", from.placeId ?? from.name, to.placeId ?? to.name],
    queryFn: () =>
      fetchWalkingRoute(
        { latitude: from.latitude!, longitude: from.longitude! },
        { latitude: to.latitude!, longitude: to.longitude! }
      ),
    enabled: isWalk && hasCoords,
  });
  const route = routeQuery.data;
  // 다음 useEffect 콜백(geolocation watch)에서 매번 재구독하지 않고도 최신 route를
  // 읽으려고 ref로 미러링한다.
  const routeRef = useRef(route);
  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  // 실시간 위치 추적 — watchPosition으로 계속 갱신한다(getCurrentPosition은 1회성이라 안 맞음).
  // ponytail: 정밀 맵매칭이 아니라 "다음 안내 지점이 지금 지점보다 가까워지면 지나온 것으로
  // 본다"는 휴리스틱이다 — GPS 오차가 크거나 스텝 간격이 촘촘하면 어긋날 수 있음.
  // 업그레이드하려면 경로 폴리라인에 실제 투영(map matching)해서 진행률을 계산해야 한다.
  const [userPos, setUserPos] = useState<{ latitude: number; longitude: number } | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  useEffect(() => {
    // 도보 턴 안내가 있을 때만 위치를 계속 따라간다.
    if (!isWalk || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setUserPos(p);
        const r = routeRef.current;
        if (!r) return;
        setStepIndex((current) => {
          let idx = current;
          while (idx < r.steps.length - 1) {
            const distToCurrent = haversineMeters(p, r.steps[idx]);
            const distToNext = haversineMeters(p, r.steps[idx + 1]);
            if (distToNext < distToCurrent) idx += 1;
            else break;
          }
          return idx;
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isWalk]);

  // 구간(from/to)이 바뀌면 진행 스텝을 처음으로 되돌린다 — 렌더 중 비교로 처리해서
  // (InputScreen.tsx의 prevRecommendation 패턴과 동일) 이펙트 안에서 setState 안 함.
  const routeKey = `${from.placeId ?? from.name}|${to.placeId ?? to.name}`;
  const [trackedRouteKey, setTrackedRouteKey] = useState(routeKey);
  if (routeKey !== trackedRouteKey) {
    setTrackedRouteKey(routeKey);
    setStepIndex(0);
  }

  const nextStep = route?.steps[stepIndex + 1] ?? null;
  const remaining = route
    ? route.steps.slice(stepIndex).reduce(
        (acc, s) => ({
          distanceM: acc.distanceM + (s.distanceToNextM ?? 0),
          timeSec: acc.timeSec + (s.timeToNextSec ?? 0),
        }),
        { distanceM: 0, timeSec: 0 }
      )
    : null;

  const spots: MapParkingSpot[] = [
    { id: "from", name: from.name, latitude: from.latitude!, longitude: from.longitude!, walkMinutes: null, order: 1 },
    { id: "to", name: to.name, latitude: to.latitude!, longitude: to.longitude!, walkMinutes: null, order: 2 },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} aria-label="뒤로가기" className="-ml-1 p-1 text-ink">
          <Icon name="back" className="h-6 w-6" />
        </button>
        <h2 className="text-[17px] font-bold text-ink">현재 구간</h2>
      </div>

      <NaverMap
        center={{ latitude: from.latitude!, longitude: from.longitude! }}
        spots={spots}
        origin={userPos ?? undefined}
        routePath={route?.path}
        className="relative h-64 w-full overflow-hidden rounded-2xl"
      />

      {isWalk && routeQuery.isLoading && <p className="px-1 text-[13px] text-muted">도보 경로 조회 중...</p>}
      {isWalk && !routeQuery.isLoading && !route && (
        <p className="px-1 text-[13px] text-muted">도보 경로를 불러오지 못했어요.</p>
      )}

      {/* 걸어가기 먼 구간 — 도보 안내 대신 차량 기준 정보와 외부 지도앱 길찾기 */}
      {!isWalk && (
        <div className="flex flex-col gap-2 rounded-2xl bg-mint-bg px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white">
              <Icon name="car" className="h-4 w-4" />
            </span>
            <p className="min-w-0 flex-1 text-[14px] font-medium text-ink">
              {to.travelDurationMin != null ? `차량으로 약 ${to.travelDurationMin}분 걸리는 구간이에요` : "걸어가기엔 먼 구간이에요"}
            </p>
          </div>
          {to.latitude != null && to.longitude != null && (
            <ExternalMapMenu
              latitude={to.latitude}
              longitude={to.longitude}
              name={to.name}
              label={`${to.name}까지 길찾기`}
              icon="arrowUpRight"
              summaryClassName="flex list-none items-center justify-center gap-1.5 rounded-full bg-white py-2.5 text-[13px] font-semibold text-ink-soft marker:content-none"
            />
          )}
        </div>
      )}

      {route && (
        <div className="flex items-center gap-2 rounded-2xl bg-mint-bg px-4 py-3.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white">
            <Icon name="arrowUp" className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-muted">다음 안내</p>
            <p className="truncate text-[14px] font-medium text-ink">
              {nextStep ? nextStep.description : "목적지에 다 왔어요"}
            </p>
          </div>
        </div>
      )}

      <p className="px-1 text-[13px] text-muted">
        {fromLabel} 장소 → {toLabel} 장소 구간이에요.
      </p>

      {remaining && (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col items-center gap-1 rounded-2xl bg-white px-2 py-3 text-center shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
            <Icon name="clock" className="h-5 w-5 text-mint-mid" />
            <span className="text-[14px] font-bold text-ink">약 {Math.max(1, Math.round(remaining.timeSec / 60))}분</span>
            <span className="text-[11px] text-muted">남은 시간</span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-2xl bg-white px-2 py-3 text-center shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
            <Icon name="pin" className="h-5 w-5 text-mint-mid" />
            <span className="text-[14px] font-bold text-ink">{remaining.distanceM}m</span>
            <span className="text-[11px] text-muted">남은 거리</span>
          </div>
        </div>
      )}

      {weatherQuery.data && (
        <div className="flex items-center gap-1.5 rounded-2xl bg-white px-4 py-3 text-[13px] shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
          <Icon name="sun" className="h-[18px] w-[18px] text-amber-400" />
          <span className="font-medium text-ink-soft">
            {weatherQuery.data.temperatureC !== null ? `${weatherQuery.data.temperatureC}°C · ` : ""}
            {weatherQuery.data.summary}
          </span>
        </div>
      )}

      <div className="rounded-2xl bg-white p-3 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
        <p className="px-1 pb-2 text-[12px] font-semibold text-muted">다음 장소</p>
        <div className="flex items-center gap-3">
          {to.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- 외부 공공데이터 이미지, 도메인 사전등록 불필요한 일반 img로 처리
            <img src={to.imageUrl} alt={to.name} className="h-14 w-14 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-mint-soft">
              <Icon name="pin" className="h-5 w-5 text-mint-mid" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-ink">{to.name}</p>
            {to.oneLineDescription && (
              <p className="truncate text-[12px] text-muted">{to.oneLineDescription}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onAdvance}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-cta py-3 text-[14px] font-semibold text-white"
        >
          <Icon name="arrowUpRight" className="h-4 w-4" />
          {advanceLabel}
        </button>
        <button
          onClick={onClose}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-hairline py-3 text-[14px] font-medium text-ink-soft"
        >
          <Icon name="menu" className="h-4 w-4" />
          전체 코스 보기
        </button>
      </div>
    </div>
  );
}
