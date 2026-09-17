"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { BottomNav } from "@/components/BottomNav";

// 데스크톱(lg+): 사이드바 상시 고정 + 옆에 콘텐츠. 모바일: 사이드바는 오버레이(Sidebar
// 자체가 fixed 처리), 콘텐츠는 기존 460px 단일 컬럼 + 하단 탭바.
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex w-full max-w-[460px] flex-1 lg:max-w-none lg:pl-[280px]">
      <Sidebar />
      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col bg-page">
        {/* 화면이 바뀔 때마다 같은 SETTLE로 한 번 올라오며 들어온다 —
            pathname을 key로 줘서 라우트가 바뀔 때만 다시 재생된다. */}
        <div
          key={pathname}
          className="sk-page flex flex-1 flex-col pb-[calc(var(--sk-dock)+12px+env(safe-area-inset-bottom))] lg:pb-6"
        >
          {children}
        </div>
        <div className="lg:hidden">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
