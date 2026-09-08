"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";

// 모바일 전용(데스크톱은 AppShell이 lg:hidden으로 감싼다) — 사이드바 화면(홈/채팅/마이)에서만 노출.
const RESULTS_PATH = /^\/recommend(\/|$)/;

export function BottomNav() {
  const pathname = usePathname();
  const onRecommend = RESULTS_PATH.test(pathname);
  const show = pathname === "/" || onRecommend || pathname === "/mypage";
  if (!show) return null;

  const tabs = [
    { id: "home", label: "홈", icon: "home", href: "/", active: pathname === "/" },
    { id: "recommend", label: "추천", icon: "compass", href: "/recommend", active: onRecommend },
    { id: "saved", label: "저장", icon: "heart", href: "/mypage", active: false },
    { id: "mypage", label: "마이", icon: "user", href: "/mypage", active: pathname === "/mypage" },
  ];

  return (
    <nav className="sticky bottom-0 mt-auto flex items-center justify-around border-t border-hairline bg-white/95 px-2 pb-2 pt-2 backdrop-blur">
      {tabs.map((tab) => (
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
      ))}
    </nav>
  );
}
