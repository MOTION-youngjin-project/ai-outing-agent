"use client";

import { Icon } from "@/components/Icon";
import {
  detectPlatform,
  kakaoDirectionsUrl,
  googleDirectionsUrl,
  buildNaverNavigationPlan,
  openNaverNavigation,
} from "@/lib/externalMapLinks";

// 네이버(앱 스킴만 있음)/카카오/구글 3개 중 하나를 골라 외부 지도 앱으로 길찾기를 넘기는
// <details> 메뉴 — ParkingDetailScreen에서 처음 만들었고 CourseCard·DirectionsScreen도
// 같은 메뉴가 필요해져서(3번째 사용처) 공용 컴포넌트로 뺐다.
export function ExternalMapMenu({
  latitude,
  longitude,
  name,
  label = "지도에서 보기",
  className,
  summaryClassName,
  // 버튼 여러 개가 나란히 있는 좁은 자리(예: CourseCard의 3버튼 줄)에 넣을 땐 메뉴가
  // 아래로 펼쳐질 공간이 없어 위로 띄운다.
  popupAbove = false,
}: {
  latitude: number;
  longitude: number;
  name: string;
  label?: string;
  className?: string;
  summaryClassName?: string;
  popupAbove?: boolean;
}) {
  function openNaver() {
    const platform = detectPlatform(navigator.userAgent);
    openNaverNavigation(buildNaverNavigationPlan(platform, latitude, longitude, name));
  }
  function openKakao() {
    window.open(kakaoDirectionsUrl(latitude, longitude, name), "_blank", "noopener,noreferrer");
  }
  function openGoogle() {
    window.open(googleDirectionsUrl(latitude, longitude), "_blank", "noopener,noreferrer");
  }

  return (
    <details className={`group ${popupAbove ? "relative" : ""} [&_summary::-webkit-details-marker]:hidden ${className ?? ""}`}>
      <summary
        className={
          summaryClassName ??
          "flex list-none items-center justify-center gap-1.5 rounded-full bg-accent py-3 text-[14px] font-semibold text-white marker:content-none"
        }
      >
        <Icon name="send" className="h-4 w-4" />
        {label}
      </summary>
      <div
        className={
          popupAbove
            ? "absolute right-0 bottom-full z-10 mb-1.5 flex w-32 flex-col gap-1 rounded-2xl bg-white p-1.5 shadow-[0_1px_6px_rgba(17,24,39,0.15)]"
            : "mt-2 flex flex-col gap-1.5 rounded-2xl bg-white p-2 shadow-[0_1px_3px_rgba(17,24,39,0.08)]"
        }
      >
        <button onClick={openNaver} className="rounded-xl py-2.5 text-[13px] font-medium text-ink-soft hover:bg-page">
          네이버 지도
        </button>
        <button onClick={openKakao} className="rounded-xl py-2.5 text-[13px] font-medium text-ink-soft hover:bg-page">
          카카오맵
        </button>
        <button onClick={openGoogle} className="rounded-xl py-2.5 text-[13px] font-medium text-ink-soft hover:bg-page">
          구글 지도
        </button>
      </div>
    </details>
  );
}
