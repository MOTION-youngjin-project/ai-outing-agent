"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";

// /recommend/[runId] 결과 화면에서만 보이고, 그 아래 상세/주차 화면에선 숨긴다 —
// 기존 view 기반 showBottomNav(input/results/mypage)와 동일한 범위.
const RESULTS_PATH = /^\/recommend\/[^/]+$/;

export function BottomNav() {
  const pathname = usePathname();
  const onResults = RESULTS_PATH.test(pathname);
  const show = pathname === "/" || onResults || pathname === "/mypage";
  if (!show) return null;

  const tabs = [
    { id: "home", label: "홈", icon: "home", href: "/", active: pathname === "/" },
    { id: "recommend", label: "추천", icon: "compass", href: null, active: onResults },
    { id: "saved", label: "저장", icon: "heart", href: "/mypage", active: false },
    { id: "mypage", label: "마이", icon: "user", href: "/mypage", active: pathname === "/mypage" },
  ];

  return (
    <nav className="sticky bottom-0 mt-auto flex items-center justify-around border-t border-hairline bg-white/95 px-2 pb-2 pt-2 backdrop-blur">
      {tabs.map((tab) =>
        tab.href ? (
          <Link
            key={tab.id}
            href={tab.href}
            className={`flex flex-1 flex-col items-center gap-1 py-1 text-[11px] font-medium ${
              tab.active ? "text-accent" : "text-slate-400"
            }`}
          >
            <Icon name={tab.icon} className="h-[22px] w-[22px]" />
            {tab.label}
          </Link>
        ) : (
          // "추천" 탭은 결과가 있을 때만 의미가 있는데 마지막 runId를 URL 밖에 들고 있지
          // 않으니(새로고침해도 사라지면 안 됨) 이동 대상이 없다 — 지금 결과 화면에 있을
          // 때만 활성 표시로, 클릭 자체는 없는 화면 밖에선 비활성.
          <span
            key={tab.id}
            className={`flex flex-1 flex-col items-center gap-1 py-1 text-[11px] font-medium ${
              tab.active ? "text-accent" : "text-slate-300"
            }`}
          >
            <Icon name={tab.icon} className="h-[22px] w-[22px]" />
            {tab.label}
          </span>
        )
      )}
    </nav>
  );
}
