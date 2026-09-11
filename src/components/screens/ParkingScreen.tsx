"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchParking, type ParkingSpotWithDistance, type PlaceWithMeta } from "@/lib/clientApi";
import { occupancyLabel } from "@/lib/parkingDisplay";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { KakaoMap } from "@/components/KakaoMap";

// 시트 상단이 컨테이너 높이에서 차지하는 비율. 드래그하면 이 범위에서 자유롭게 움직이다가
// 손을 떼면 가장 가까운 스냅 지점으로 붙는다.
// COLLAPSED는 손잡이만 남기고 거의 다 내려서 지도를 온전히 보는 상태다.
const SNAP_EXPANDED = 0.1; // 목록 위주
const SNAP_PEEK = 0.56; // 지도 + 목록 절반
const SNAP_COLLAPSED = 0.93; // 지도만
const SNAP_POINTS = [SNAP_EXPANDED, SNAP_PEEK, SNAP_COLLAPSED];

function nearestSnap(ratio: number): number {
  return SNAP_POINTS.reduce((best, p) =>
    Math.abs(p - ratio) < Math.abs(best - ratio) ? p : best
  );
}

export function ParkingScreen({
  place,
  runId,
  placeId,
}: {
  place: PlaceWithMeta;
  runId: string | null;
  placeId: string;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(search.get("selected"));
  const placeHref = runId ? `/recommend/${runId}/place/${placeId}` : `/place/${placeId}`;

  const parkingQuery = useQuery({
    queryKey: ["parking", place.daeguDistrict, place.name, place.latitude, place.longitude],
    queryFn: () => fetchParking(place.daeguDistrict!, place.name, place),
    retry: false,
    refetchInterval: 60_000,
    enabled: !!place.daeguDistrict,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startRatio: number; height: number } | null>(null);
  const [sheetRatio, setSheetRatio] = useState(SNAP_PEEK);
  const [dragging, setDragging] = useState(false);

  function onHandlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const height = containerRef.current?.clientHeight ?? 1;
    dragRef.current = { startY: e.clientY, startRatio: sheetRatio, height };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onHandlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const { startY, startRatio, height } = dragRef.current;
    const deltaRatio = (e.clientY - startY) / height;
    setSheetRatio(Math.min(SNAP_COLLAPSED, Math.max(SNAP_EXPANDED, startRatio + deltaRatio)));
  }

  function onHandlePointerUp() {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    setSheetRatio(nearestSnap);
  }

  function openParkingDetail(spot: ParkingSpotWithDistance) {
    router.push(`${placeHref}/parking/${spot.id}`);
  }

  // 지도 위 바텀시트(목적지 좌표 있음)와 목록만 보여주는 폴백(목적지 좌표 없음) 둘 다
  // 같은 항목 UI를 쓴다.
  function ParkingSpotItem({ spot, index }: { spot: ParkingSpotWithDistance; index: number }) {
    const occ = occupancyLabel(spot);
    return (
      <button
        aria-pressed={selectedId === spot.id}
        onClick={() => { setSelectedId(spot.id); router.replace(`${placeHref}/parking?selected=${encodeURIComponent(spot.id)}`, { scroll: false }); }}
        className="flex w-full items-start gap-3 rounded-2xl bg-white px-4 py-3.5 text-left shadow-[0_1px_3px_rgba(17,24,39,0.05)] ring-1 ring-hairline"
      >
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint-soft text-[13px] font-bold text-mint-mid">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[16px] font-bold text-ink">{spot.name}</span>
            {spot.ownerType && (
              <span className="shrink-0 rounded-full bg-mint-bg px-2 py-0.5 text-[11px] font-medium text-accent">
                {spot.ownerType}
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[13px] text-muted">
            {spot.walkMinutes !== null && `도보 추정 ${spot.walkMinutes}분 (직선 ${spot.distanceMeters}m)`}
            {spot.operatingHours &&
              (spot.walkMinutes !== null ? ` · 운영 ${spot.operatingHours}` : `운영 ${spot.operatingHours}`)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {occ && <div className={`text-[14px] font-bold ${occ.className}`}>{occ.label}</div>}
          <div className="mt-0.5 text-[13px] text-muted">
            {spot.remainingSpaces ?? "-"} / {spot.capacity ?? "-"}
          </div>
        </div>
      </button>
    );
  }

  return (
    <>
      <ScreenHeader
        title={`${place.name} 주차 정보`}
        onBack={() => router.push(placeHref)}
        right={
          <span className="p-1 text-slate-300">
            <Icon name="heart" className="h-[22px] w-[22px]" />
          </span>
        }
      />

      {parkingQuery.isLoading && (
        <div className="flex items-center gap-2 px-5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          <p className="text-[14px] text-muted">주차장 조회 중...</p>
        </div>
      )}
      {parkingQuery.isError && <div role="alert" className="px-5 py-4"><p>주차장 정보를 불러오지 못했습니다.</p><button onClick={() => parkingQuery.refetch()} className="mt-2 text-accent">주차장 다시 조회</button></div>}
      {selectedId && parkingQuery.data?.spots.some(s => s.id === selectedId) && <div className="px-5 py-3"><button className="rounded-full bg-accent px-4 py-2 text-white" onClick={() => openParkingDetail(parkingQuery.data!.spots.find(s => s.id === selectedId)!)}>선택한 주차장 상세보기</button></div>}
      {!parkingQuery.isLoading && parkingQuery.data?.spots.length === 0 && (
        <p className="px-6 text-[14px] text-muted">주차장 정보를 찾을 수 없습니다.</p>
      )}

      {/* 카카오가 이 장소 이름을 못 찾아 목적지 좌표가 없는 경우 — 지도는 못 그려도
          이 구의 대표 주차장 목록 자체는 유효한 데이터라 목록만이라도 보여준다. */}
      {!parkingQuery.isLoading &&
        parkingQuery.data &&
        parkingQuery.data.spots.length > 0 &&
        !parkingQuery.data.destination && (
          <div className="flex flex-col gap-3 px-5">
            <div className="flex gap-2 rounded-2xl bg-mint-bg px-4 py-3.5 text-[12px] leading-relaxed text-ink-soft">
              <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-mint-mid" />
              <p>이 장소의 정확한 위치를 찾지 못해 이 지역 대표 주차장을 보여드려요. 거리 정렬은 지원하지 않아요.</p>
            </div>
            <div className="flex flex-col gap-2.5">
              {parkingQuery.data.spots.map((s, i) => (
                <ParkingSpotItem key={s.id} spot={s} index={i} />
              ))}
            </div>
          </div>
        )}

      {!parkingQuery.isLoading && parkingQuery.data && parkingQuery.data.destination && (
        <div ref={containerRef} className="relative h-[calc(100dvh-76px)] overflow-hidden">
          <KakaoMap
            selectedId={selectedId}
            onSelect={setSelectedId}
            className="absolute inset-0"
            // 현재 위치 버튼을 시트 바로 위에 띄운다 — 시트를 내리면 버튼도 같이 내려간다.
            controlsBottom={`calc(${(1 - sheetRatio) * 100}% + 0.75rem)`}
            controlsAnimated={!dragging}
            center={parkingQuery.data.destination}
            destinationLabel={place.name}
            spots={parkingQuery.data.spots
              .map((s, i) => ({ ...s, order: i + 1 }))
              .filter((s) => s.latitude !== null && s.longitude !== null)
              .map((s) => ({
                id: s.id,
                name: s.name,
                latitude: s.latitude!,
                longitude: s.longitude!,
                walkMinutes: s.walkMinutes,
                order: s.order,
              }))}
          />

          {/* 드래그 바텀시트 — 손 떼면 SNAP_EXPANDED/SNAP_PEEK 중 가까운 쪽으로 스냅.
              드래그 중엔 transition을 꺼서 손가락을 그대로 따라가게 한다. */}
          <div
            className={`absolute inset-x-0 bottom-0 z-10 flex flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_-2px_16px_rgba(17,24,39,0.1)] ${
              dragging ? "" : "transition-[top] duration-200 ease-out"
            }`}
            style={{ top: `${sheetRatio * 100}%` }}
          >
            <div
              onPointerDown={onHandlePointerDown}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              onPointerCancel={onHandlePointerUp}
              className="flex shrink-0 cursor-grab touch-none select-none items-center justify-center py-2.5 active:cursor-grabbing"
            >
              <span className="h-1 w-9 rounded-full bg-slate-300" />
            </div>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 pb-4">
              {parkingQuery.data.spots.length > 0 && (
                <>
                  <div className="flex items-center justify-between px-1">
                    <h2 className="flex items-center gap-1 text-[15px] font-bold text-ink">
                      주차장 목록
                      <Icon name="info" className="h-3.5 w-3.5 text-slate-300" />
                    </h2>
                    <span className="text-[13px] text-muted">직선거리순 · 도보 분당 67m 추정</span>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {parkingQuery.data.spots.map((s, i) => (
                      <ParkingSpotItem key={s.id} spot={s} index={i} />
                    ))}
                  </div>

                  <div className="flex gap-2 rounded-2xl bg-slate-50 px-4 py-3.5 text-[12px] leading-relaxed text-muted">
                    <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                    <p>주차 요금 및 운영시간은 변동될 수 있어요. 방문 전 현장 안내를 확인해 주세요.</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
