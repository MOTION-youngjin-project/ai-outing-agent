"use client";

import { useAppStore } from "@/lib/store";
import { occupancyLabel } from "@/lib/parkingDisplay";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";

export function ParkingDetailScreen() {
  const { selectedParkingSpot, setView } = useAppStore();
  if (!selectedParkingSpot) return null;

  const occ = occupancyLabel(selectedParkingSpot);

  return (
    <>
      <ScreenHeader title={selectedParkingSpot.name} onBack={() => setView("parking")} />
      <div className="flex flex-col gap-3 px-5">
        <div className="flex h-48 w-full items-center justify-center rounded-2xl bg-slate-100 text-[13px] text-slate-400">
          사진 영역
        </div>

        <div className="rounded-2xl bg-white px-4 py-4 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint-soft text-[13px] font-bold text-mint-mid">
              P
            </div>
            <h2 className="min-w-0 truncate text-[18px] font-bold text-ink">{selectedParkingSpot.name}</h2>
            {selectedParkingSpot.ownerType && (
              <span className="shrink-0 rounded-full bg-mint-bg px-2 py-0.5 text-[11px] font-medium text-accent">
                {selectedParkingSpot.ownerType}
              </span>
            )}
          </div>
          <div className="mt-2 text-[13px] text-muted">{selectedParkingSpot.address}</div>
        </div>

        <div className="rounded-2xl bg-mint-bg px-4 py-4">
          <div className="text-[13px] text-muted">현재 주차 여유</div>
          <div className="mt-1 flex items-end justify-between">
            {occ ? (
              <span className={`text-[18px] font-bold ${occ.className}`}>{occ.label}</span>
            ) : (
              <span className="text-[14px] text-slate-400">정보 없음</span>
            )}
            <span className="text-[20px] font-bold text-ink">
              {selectedParkingSpot.remainingSpaces ?? "-"} / {selectedParkingSpot.capacity}면
            </span>
          </div>
        </div>

        <div className="flex flex-col divide-y divide-hairline rounded-2xl bg-white px-4 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
          <div className="flex items-start gap-3 py-3.5">
            <Icon name="clock" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
            <div>
              <div className="text-[12px] text-muted">운영시간</div>
              <div className="mt-0.5 text-[14px] text-ink-soft">
                {selectedParkingSpot.operatingHours ?? "정보 없음"}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 py-3.5">
            <Icon name="bookmark" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
            <div>
              <div className="text-[12px] text-muted">주차 요금</div>
              <div className="mt-0.5 flex flex-col text-[14px] text-ink-soft">
                {selectedParkingSpot.feeLines?.map((line, i) => <span key={i}>{line}</span>) ?? "정보 없음"}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 py-3.5">
            <Icon name="parking" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
            <div>
              <div className="text-[12px] text-muted">주차 형태</div>
              <div className="mt-0.5 text-[14px] text-ink-soft">
                {selectedParkingSpot.lotType ? `${selectedParkingSpot.lotType} 주차장` : "정보 없음"}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 py-3.5">
            <Icon name="card" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
            <div>
              <div className="text-[12px] text-muted">결제 방법</div>
              <div className="mt-0.5 text-[14px] text-ink-soft">
                {selectedParkingSpot.paymentMethod ?? "정보 없음"}
              </div>
            </div>
          </div>
        </div>

        {selectedParkingSpot.remark && (
          <div className="flex gap-2 rounded-2xl bg-slate-50 px-4 py-3.5 text-[12px] leading-relaxed text-muted">
            <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
            <p>{selectedParkingSpot.remark}</p>
          </div>
        )}

        <button
          onClick={() => setView("parking")}
          className="flex items-center justify-center gap-1.5 rounded-full bg-accent py-3 text-[14px] font-semibold text-white"
        >
          <Icon name="pin" className="h-4 w-4" />
          지도에서 보기
        </button>
        {selectedParkingSpot.latitude !== null && selectedParkingSpot.longitude !== null && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${selectedParkingSpot.latitude},${selectedParkingSpot.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-full border border-hairline py-3 text-[14px] font-medium text-ink-soft"
          >
            외부 지도 앱으로 길찾기
          </a>
        )}
      </div>
    </>
  );
}
