"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { fetchTransitDirections, getCurrentPosition, type PlaceWithMeta } from "@/lib/clientApi";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";

const MODE_ICON: Record<string, string> = {
  BUS: "bus",
  TRAM: "bus",
  SUBWAY: "train",
  RAIL: "train",
  LONG_DISTANCE: "train",
};

export function TransitScreen({
  place,
  runId,
  placeId,
}: {
  place: PlaceWithMeta;
  runId: string | null;
  placeId: string;
}) {
  const router = useRouter();
  const placeHref = runId ? `/recommend/${runId}/place/${placeId}` : `/place/${placeId}`;

  // 사용자 현재 위치를 출발지로 쓴다 — 위치 없이는 경로 자체를 계산할 방법이 없어서
  // (Transitous가 좌표 두 개를 요구함) 권한 거부/미지원이면 안내만 하고 끝낸다.
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number } | null | undefined>(undefined);
  useEffect(() => {
    getCurrentPosition().then(setOrigin);
  }, []);

  const hasDestination = place.latitude != null && place.longitude != null;
  const transitQuery = useQuery({
    queryKey: ["transit", origin?.latitude, origin?.longitude, place.latitude, place.longitude],
    queryFn: () =>
      fetchTransitDirections(origin!, { latitude: place.latitude!, longitude: place.longitude! }),
    enabled: !!origin && hasDestination,
  });

  return (
    <>
      <ScreenHeader title={`${place.name} 대중교통 길찾기`} onBack={() => router.push(placeHref)} />

      <div className="sk-stagger flex flex-col gap-3 px-5">
        {origin === undefined && (
          <div className="flex items-center gap-2">
            <span className="sk-dot" />
            <p className="text-[14px] text-muted">현재 위치 확인 중...</p>
          </div>
        )}

        {origin === null && (
          <div className="sk-rail-none flex gap-2 py-2 text-[13px] leading-relaxed text-ink-soft">
            <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-mint-mid" />
            <p>현재 위치를 가져올 수 없어요. 브라우저 위치 권한을 확인해주세요.</p>
          </div>
        )}

        {!hasDestination && (
          <p className="sk-rail-none py-2 text-[14px] text-muted">이 장소는 좌표 정보가 없어 길찾기를 할 수 없어요.</p>
        )}

        {/* 조회 중에는 실제 결과 카드와 같은 형태의 스켈레톤을 보여준다 —
            빈 화면에서 카드가 튀어나오는 대신 자리와 높이가 미리 잡힌다. */}
        {transitQuery.isLoading && (
          <div className="sk-panel sk-scan sk-enter p-4" role="status" aria-label="대중교통 경로 조회 중">
            <div className="flex items-center justify-between">
              <span className="sk-skel h-[18px] w-24" />
              <span className="sk-skel h-[14px] w-16" />
            </div>
            <div className="mt-3 flex flex-col gap-2.5">
              {[0, 1].map((i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className="sk-skel h-8 w-8 shrink-0" />
                  <span className="sk-skel h-[14px] flex-1" />
                </div>
              ))}
            </div>
          </div>
        )}

        {transitQuery.isError && (
          <p className="sk-rail-none py-2 text-[14px] text-muted">경로를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
        )}

        {transitQuery.data && transitQuery.data.length === 0 && (
          <p className="sk-rail-none py-2 text-[14px] text-muted">이용 가능한 대중교통 경로를 찾지 못했어요.</p>
        )}

        {transitQuery.data?.map((itinerary, i) => {
          const legs = itinerary.legs.filter((leg) => leg.mode !== "WALK");
          return (
            <div key={i} className="sk-panel sk-enter sk-stagger p-4">
              {/* 소요시간·환승 횟수는 Transitous가 준 실측값이라 실선 레일 */}
              <div className="sk-rail flex items-center justify-between py-0.5">
                <span className="text-[16px] font-bold text-ink">약 {itinerary.durationMin}분</span>
                <span className="text-[13px] text-muted">환승 {itinerary.transfers}회</span>
              </div>
              <div className="mt-3 flex flex-col">
                {legs.map((leg, j) => (
                  <div key={j} className="flex gap-2.5">
                    {/* 스텝 노드 — 코스 정류지·주차장 번호와 같은 조형.
                        구간 사이는 점선으로 이어서 "순서가 있는 경로"임을 드러낸다. */}
                    <div className="flex flex-col items-center">
                      <span className="sk-slot h-8 w-8">
                        <Icon name={MODE_ICON[leg.mode] ?? "compass"} className="h-4 w-4" />
                      </span>
                      {j < legs.length - 1 && (
                        <span className="w-px flex-1 border-l border-dashed border-[var(--sk-line)]" />
                      )}
                    </div>
                    <div className={`min-w-0 flex-1 text-[13px] ${j < legs.length - 1 ? "pb-3" : ""}`}>
                      <span className="font-semibold text-ink">{leg.modeLabel}</span>
                      {leg.routeShortName && <span className="text-ink-soft"> {leg.routeShortName}</span>}
                      {leg.headsign && <span className="text-muted"> · {leg.headsign} 방면</span>}
                      <div className="truncate text-[12px] text-muted">
                        {leg.from} → {leg.to}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
