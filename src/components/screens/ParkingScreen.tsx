"use client";

import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import { fetchParking, type ParkingSpotWithDistance } from "@/lib/clientApi";
import { occupancyLabel } from "@/lib/parkingDisplay";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { KakaoMap } from "@/components/KakaoMap";

export function ParkingScreen() {
  const { selectedPlace, setView, selectParkingSpot } = useAppStore();

  const parkingQuery = useQuery({
    queryKey: ["parking", selectedPlace?.daeguDistrict, selectedPlace?.name],
    queryFn: () => fetchParking(selectedPlace!.daeguDistrict!, selectedPlace!.name),
    enabled: !!selectedPlace?.daeguDistrict,
  });

  function openParkingDetail(spot: ParkingSpotWithDistance) {
    selectParkingSpot(spot);
    setView("parking-detail");
  }

  return (
    <>
      <ScreenHeader
        title={`${selectedPlace?.name ?? ""} 주차 정보`}
        onBack={() => setView("detail")}
        right={
          <span className="p-1 text-slate-300">
            <Icon name="heart" className="h-[22px] w-[22px]" />
          </span>
        }
      />
      <div className="flex flex-col gap-3 px-5">
        {parkingQuery.isLoading && (
          <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3.5 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            <p className="text-[14px] text-muted">주차장 조회 중...</p>
          </div>
        )}
        {!parkingQuery.isLoading && parkingQuery.data?.spots.length === 0 && (
          <p className="px-1 text-[14px] text-muted">주차장 정보를 찾을 수 없습니다.</p>
        )}

        {!parkingQuery.isLoading && parkingQuery.data && parkingQuery.data.destination && (
          <KakaoMap
            center={parkingQuery.data.destination}
            destinationLabel={selectedPlace?.name ?? ""}
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
        )}

        {!parkingQuery.isLoading && parkingQuery.data && parkingQuery.data.spots.length > 0 && (
          <>
            <div className="flex items-center justify-between px-1 pt-1">
              <h2 className="flex items-center gap-1 text-[15px] font-bold text-ink">
                주차장 목록
                <Icon name="info" className="h-3.5 w-3.5 text-slate-300" />
              </h2>
              {parkingQuery.data.destination && <span className="text-[13px] text-muted">거리순</span>}
            </div>

            <div className="flex flex-col gap-2.5">
              {parkingQuery.data.spots.map((s, i) => {
                const occ = occupancyLabel(s);
                return (
                  <button
                    key={s.id}
                    onClick={() => openParkingDetail(s)}
                    className="flex w-full items-start gap-3 rounded-2xl bg-white px-4 py-3.5 text-left shadow-[0_1px_3px_rgba(17,24,39,0.05)]"
                  >
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint-soft text-[13px] font-bold text-mint-mid">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[16px] font-bold text-ink">{s.name}</span>
                        {s.ownerType && (
                          <span className="shrink-0 rounded-full bg-mint-bg px-2 py-0.5 text-[11px] font-medium text-accent">
                            {s.ownerType}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-[13px] text-muted">
                        {s.walkMinutes !== null && `도보 ${s.walkMinutes}분 (${s.distanceMeters}m)`}
                        {s.operatingHours && (s.walkMinutes !== null ? ` · 운영 ${s.operatingHours}` : `운영 ${s.operatingHours}`)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {occ && <div className={`text-[14px] font-bold ${occ.className}`}>{occ.label}</div>}
                      <div className="mt-0.5 text-[13px] text-muted">
                        {s.remainingSpaces ?? "-"} / {s.capacity}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2 rounded-2xl bg-slate-50 px-4 py-3.5 text-[12px] leading-relaxed text-muted">
              <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
              <p>주차 요금 및 운영시간은 변동될 수 있어요. 방문 전 현장 안내를 확인해 주세요.</p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
