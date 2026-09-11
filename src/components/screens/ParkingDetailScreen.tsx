"use client";

import { useRouter } from "next/navigation";
import { occupancyLabel } from "@/lib/parkingDisplay";
import type { ParkingSpotWithDistance } from "@/lib/clientApi";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import {
  detectPlatform,
  kakaoDirectionsUrl,
  googleDirectionsUrl,
  buildNaverNavigationPlan,
  openNaverNavigation,
} from "@/lib/externalMapLinks";

export function ParkingDetailScreen({
  spot,
  runId,
  placeId,
}: {
  spot: ParkingSpotWithDistance;
  runId: string | null;
  placeId: string;
}) {
  const router = useRouter();
  const occ = occupancyLabel(spot);
  const hasCoords = spot.latitude !== null && spot.longitude !== null;
  const parkingListHref = (runId ? `/recommend/${runId}/place/${placeId}/parking` : `/place/${placeId}/parking`) + `?selected=${encodeURIComponent(spot.id)}`;

  function share() {
    if (typeof navigator === "undefined" || !navigator.share) return;
    navigator.share({ title: spot.name, text: spot.address, url: window.location.href }).catch(() => {
      // 사용자가 공유 시트를 취소한 경우 등 — 조용히 무시
    });
  }

  function openKakao() {
    window.open(kakaoDirectionsUrl(spot.latitude!, spot.longitude!, spot.name), "_blank", "noopener,noreferrer");
  }
  function openGoogle() {
    window.open(googleDirectionsUrl(spot.latitude!, spot.longitude!), "_blank", "noopener,noreferrer");
  }
  function openNaver() {
    const platform = detectPlatform(navigator.userAgent);
    openNaverNavigation(buildNaverNavigationPlan(platform, spot.latitude!, spot.longitude!, spot.name));
  }

  return (
    <>
      <ScreenHeader
        title={spot.name}
        onBack={() => router.push(parkingListHref)}
        right={
          <div className="flex items-center gap-3">
            {typeof navigator !== "undefined" && !!navigator.share && (
              <button onClick={share} aria-label="공유하기" className="text-ink-soft">
                <Icon name="share" className="h-5 w-5" />
              </button>
            )}
            <span className="text-slate-300">
              <Icon name="heart" className="h-5 w-5" />
            </span>
          </div>
        }
      />
      <div className="flex flex-col gap-3 px-5">
        <div className="flex h-48 w-full items-center justify-center rounded-2xl bg-slate-100 text-[13px] text-slate-400">
          사진 영역
        </div>

        <div className="rounded-2xl bg-white px-4 py-4 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint-soft text-[13px] font-bold text-mint-mid">
              P
            </div>
            <h2 className="min-w-0 truncate text-[18px] font-bold text-ink">{spot.name}</h2>
            {spot.ownerType && (
              <span className="shrink-0 rounded-full bg-mint-bg px-2 py-0.5 text-[11px] font-medium text-accent">
                {spot.ownerType}
              </span>
            )}
          </div>
          <div className="mt-2 text-[13px] text-muted">
            {[
              spot.walkMinutes !== null ? `도보 추정 ${spot.walkMinutes}분 (직선 ${spot.distanceMeters}m)` : null,
              spot.address,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
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
              {spot.remainingSpaces ?? "-"} / {spot.capacity ?? "-"}면
              {spot.realtimeFetchedAt && <span className="block text-xs font-normal text-muted">조회 {new Date(spot.realtimeFetchedAt).toLocaleTimeString("ko-KR")} · 현장 상황은 달라질 수 있어요</span>}
            </span>
          </div>
        </div>

        <div className="flex flex-col divide-y divide-hairline rounded-2xl bg-white px-4 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
          <div className="flex items-start gap-3 py-3.5">
            <Icon name="clock" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
            <div>
              <div className="text-[12px] text-muted">운영시간</div>
              <div className="mt-0.5 text-[14px] text-ink-soft">{spot.operatingHours ?? "정보 없음"}</div>
            </div>
          </div>
          <div className="flex items-start gap-3 py-3.5">
            <Icon name="bookmark" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
            <div>
              <div className="text-[12px] text-muted">주차 요금</div>
              <div className="mt-0.5 flex flex-col text-[14px] text-ink-soft">
                {spot.feeLines?.map((line, i) => <span key={i}>{line}</span>) ?? "정보 없음"}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 py-3.5">
            <Icon name="user" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
            <div>
              <div className="text-[12px] text-muted">주차 형태</div>
              <div className="mt-0.5 text-[14px] text-ink-soft">
                {spot.lotType ? `${spot.lotType} 주차장` : "정보 없음"}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 py-3.5">
            <Icon name="card" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
            <div>
              <div className="text-[12px] text-muted">결제 방법</div>
              <div className="mt-0.5 text-[14px] text-ink-soft">{spot.paymentMethod ?? "정보 없음"}</div>
            </div>
          </div>
          {spot.remark && (
            <div className="flex items-start gap-3 py-3.5">
              <Icon name="triangleAlert" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
              <div>
                <div className="text-[12px] text-muted">특이사항</div>
                <div className="mt-0.5 text-[14px] text-ink-soft">{spot.remark}</div>
              </div>
            </div>
          )}
        </div>

        {hasCoords ? (
          <details className="group mb-4 [&_summary::-webkit-details-marker]:hidden">
            <summary
              className="flex list-none items-center justify-center gap-1.5 rounded-full bg-accent py-3 text-[14px] font-semibold text-white marker:content-none"
            >
              <Icon name="send" className="h-4 w-4" />
              지도에서 보기
            </summary>
            <div className="mt-2 flex flex-col gap-1.5 rounded-2xl bg-white p-2 shadow-[0_1px_3px_rgba(17,24,39,0.08)]">
              <button onClick={openNaver} className="rounded-xl py-2.5 text-[14px] font-medium text-ink-soft hover:bg-page">
                네이버 지도
              </button>
              <button onClick={openKakao} className="rounded-xl py-2.5 text-[14px] font-medium text-ink-soft hover:bg-page">
                카카오맵
              </button>
              <button onClick={openGoogle} className="rounded-xl py-2.5 text-[14px] font-medium text-ink-soft hover:bg-page">
                구글 지도
              </button>
            </div>
          </details>
        ) : (
          <button
            onClick={() => router.push(parkingListHref)}
            className="mb-4 flex items-center justify-center gap-1.5 rounded-full bg-accent py-3 text-[14px] font-semibold text-white"
          >
            <Icon name="send" className="h-4 w-4" />
            지도에서 보기
          </button>
        )}
      </div>
    </>
  );
}
