"use client";

import { useAppStore } from "@/lib/store";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";

export function DetailScreen() {
  const { selectedPlace, setView } = useAppStore();
  if (!selectedPlace) return null;

  return (
    <>
      <ScreenHeader title="장소 정보" onBack={() => setView("results")} />
      <div className="flex flex-col gap-3 px-5">
        {selectedPlace.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- 외부 공공데이터 이미지, 도메인 사전등록 불필요한 일반 img로 처리
          <img src={selectedPlace.imageUrl} alt={selectedPlace.name} className="h-48 w-full rounded-2xl object-cover" />
        )}
        <div className="rounded-2xl bg-white px-4 py-4 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
          <h2 className="text-[20px] font-bold text-ink">{selectedPlace.name}</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{selectedPlace.reason}</p>
        </div>

        <div className="flex flex-col gap-2.5 rounded-2xl bg-white px-4 py-4 text-[14px] shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
          {selectedPlace.address && (
            <div className="flex gap-2">
              <Icon name="pin" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
              <span className="text-ink-soft">{selectedPlace.address}</span>
            </div>
          )}
          {selectedPlace.operatingHours && (
            <div className="flex gap-2">
              <Icon name="clock" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
              <span className="text-ink-soft">{selectedPlace.operatingHours}</span>
            </div>
          )}
          {selectedPlace.fee && (
            <div className="flex gap-2">
              <Icon name="bookmark" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
              <span className="text-ink-soft">{selectedPlace.fee}</span>
            </div>
          )}
        </div>

        {selectedPlace.features && selectedPlace.features.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedPlace.features.map((f, i) => (
              <span key={i} className="rounded-full bg-mint-bg px-3 py-1.5 text-[13px] font-medium text-accent">
                {f}
              </span>
            ))}
          </div>
        )}

        {selectedPlace.daeguDistrict && (
          <button
            onClick={() => setView("parking")}
            className="mt-1 flex items-center justify-center gap-1.5 rounded-full bg-accent py-3 text-[15px] font-semibold text-white"
          >
            <Icon name="parking" className="h-[18px] w-[18px]" />
            주차 정보 보기
          </button>
        )}
      </div>
    </>
  );
}
