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

      <div className="flex flex-col gap-3 px-5">
        {origin === undefined && (
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            <p className="text-[14px] text-muted">현재 위치 확인 중...</p>
          </div>
        )}

        {origin === null && (
          <div className="flex gap-2 rounded-2xl bg-mint-bg px-4 py-3.5 text-[13px] leading-relaxed text-ink-soft">
            <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-mint-mid" />
            <p>현재 위치를 가져올 수 없어요. 브라우저 위치 권한을 확인해주세요.</p>
          </div>
        )}

        {!hasDestination && (
          <p className="px-1 text-[14px] text-muted">이 장소는 좌표 정보가 없어 길찾기를 할 수 없어요.</p>
        )}

        {transitQuery.isLoading && (
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            <p className="text-[14px] text-muted">대중교통 경로 조회 중...</p>
          </div>
        )}

        {transitQuery.isError && (
          <p className="px-1 text-[14px] text-muted">경로를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
        )}

        {transitQuery.data && transitQuery.data.length === 0 && (
          <p className="px-1 text-[14px] text-muted">이용 가능한 대중교통 경로를 찾지 못했어요.</p>
        )}

        {transitQuery.data?.map((itinerary, i) => (
          <div key={i} className="rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
            <div className="flex items-center justify-between">
              <span className="text-[16px] font-bold text-ink">약 {itinerary.durationMin}분</span>
              <span className="text-[13px] text-muted">환승 {itinerary.transfers}회</span>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {itinerary.legs
                .filter((leg) => leg.mode !== "WALK")
                .map((leg, j) => (
                  <div key={j} className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mint-soft text-mint-mid">
                      <Icon name={MODE_ICON[leg.mode] ?? "compass"} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1 text-[13px]">
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
        ))}
      </div>
    </>
  );
}
