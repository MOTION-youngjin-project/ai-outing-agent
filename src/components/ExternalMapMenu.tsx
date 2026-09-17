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
  icon = "send",
  className,
  summaryClassName,
  // 카드 맨 아래에 붙는 자리(예: CourseCard)에선 아래로 펼쳐질 공간이 없어 메뉴를
  // 위로 띄운다.
  popupAbove = false,
}: {
  latitude: number;
  longitude: number;
  name: string;
  label?: string;
  icon?: string;
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
          "sk sk-primary flex list-none items-center justify-center gap-1.5 px-4 py-3 text-[14px] marker:content-none"
        }
      >
        <Icon name={icon} className="h-4 w-4" />
        {label}
      </summary>
      <div
        className={
          popupAbove
            ? "sk-panel absolute right-0 bottom-full z-30 mb-2 flex w-36 flex-col gap-1 p-1.5"
            : "sk-panel mt-2 flex flex-col gap-1 p-1.5"
        }
      >
        <button onClick={openNaver} className="rounded-[10px_10px_3px_10px] px-3 py-2.5 text-left text-[13px] font-medium text-ink-soft hover:bg-page">
          네이버 지도
        </button>
        <button onClick={openKakao} className="rounded-[10px_10px_3px_10px] px-3 py-2.5 text-left text-[13px] font-medium text-ink-soft hover:bg-page">
          카카오맵
        </button>
        <button onClick={openGoogle} className="rounded-[10px_10px_3px_10px] px-3 py-2.5 text-left text-[13px] font-medium text-ink-soft hover:bg-page">
          구글 지도
        </button>
      </div>
    </details>
  );
}
