"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDrivingDirections, type PlaceWithMeta } from "@/lib/clientApi";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useBack } from "@/lib/useBack";
import { NaverMap } from "@/components/NaverMap";
import { ExternalMapMenu } from "@/components/ExternalMapMenu";
import { useOrigin, OriginFallback } from "@/components/OriginFallback";

// "추천 경로"(trafast) 먼저, 있으면 "다른 경로"(tracomfort) 순으로 탭에 건다.
const OPTION_LABELS: Record<string, string> = { trafast: "추천 경로", tracomfort: "다른 경로" };
const OPTION_ORDER = ["trafast", "tracomfort"];

export function DirectionsScreen({
  place,
  runId,
  placeId,
}: {
  place: PlaceWithMeta;
  runId: string | null;
  placeId: string;
}) {
  const placeHref = runId ? `/recommend/${runId}/place/${placeId}` : `/place/${placeId}`;
  const goBack = useBack(placeHref);

  // TransitScreen과 같은 패턴 — 현재 위치가 없으면 경로 자체를 계산할 방법이 없다.
  const { origin, setOrigin, retry } = useOrigin();

  const hasDestination = place.latitude != null && place.longitude != null;
  const directionsQuery = useQuery({
    queryKey: ["directions", origin?.latitude, origin?.longitude, place.latitude, place.longitude],
    queryFn: () => fetchDrivingDirections(origin!, { latitude: place.latitude!, longitude: place.longitude! }),
    enabled: !!origin && hasDestination,
  });

  // 가까운 구간은 옵션이 달라도 같은 길로 수렴해 거리/시간까지 완전히 같은 경로가 두 번
  // 올 수 있다 — 그럴 땐 사실상 같은 경로라 "다른 경로"로 지어내지 않고 하나만 남긴다.
  const routes = (directionsQuery.data ?? [])
    .slice()
    .sort((a, b) => OPTION_ORDER.indexOf(a.option) - OPTION_ORDER.indexOf(b.option))
    .filter(
      (r, i, all) => i === all.findIndex((o) => o.distanceM === r.distanceM && o.durationMin === r.durationMin)
    );
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const selectedRoute = routes.find((r) => r.option === selectedOption) ?? routes[0];

  return (
    <>
      <ScreenHeader title={`${place.name} 자동차 길찾기`} onBack={goBack} />

      <div className="flex flex-col gap-3 px-5">
        {origin === undefined && (
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            <p className="text-[14px] text-muted">현재 위치 확인 중...</p>
          </div>
        )}

        {origin === null && <OriginFallback onRetry={retry} onManualSelect={setOrigin} />}

        {!hasDestination && (
          <p className="px-1 text-[14px] text-muted">이 장소는 좌표 정보가 없어 길찾기를 할 수 없어요.</p>
        )}

        {directionsQuery.isLoading && (
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            <p className="text-[14px] text-muted">경로 조회 중...</p>
          </div>
        )}

        {directionsQuery.isError && (
          <p className="px-1 text-[14px] text-muted">경로를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
        )}

        {directionsQuery.data && routes.length === 0 && (
          <p className="px-1 text-[14px] text-muted">자동차 경로를 찾지 못했어요.</p>
        )}

        {selectedRoute && origin && hasDestination && (
          <>
            {routes.length > 1 && (
              <div className="flex gap-2">
                {routes.map((r) => (
                  <button
                    key={r.option}
                    onClick={() => setSelectedOption(r.option)}
                    className={
                      (selectedOption ?? routes[0].option) === r.option
                        ? "flex-1 rounded-full bg-cta py-2 text-[13px] font-semibold text-white"
                        : "flex-1 rounded-full border border-hairline bg-white py-2 text-[13px] text-ink-soft"
                    }
                  >
                    {OPTION_LABELS[r.option] ?? r.option}
                  </button>
                ))}
              </div>
            )}

            <NaverMap
              center={{ latitude: place.latitude!, longitude: place.longitude! }}
              destinationLabel={place.name}
              spots={[]}
              origin={origin}
              routePath={selectedRoute.path}
              className="relative h-64 w-full overflow-hidden rounded-2xl"
            />

            <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3.5 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
              <span className="text-[16px] font-bold text-ink">약 {selectedRoute.durationMin}분</span>
              <span className="text-[13px] text-muted">{(selectedRoute.distanceM / 1000).toFixed(1)}km</span>
            </div>

            <ExternalMapMenu latitude={place.latitude!} longitude={place.longitude!} name={place.name} label="외부 지도에서 길찾기" />
          </>
        )}
      </div>
    </>
  );
}
