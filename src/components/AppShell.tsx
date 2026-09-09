"use client";

import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { BottomNav } from "@/components/BottomNav";

// 데스크톱(lg+): 사이드바 상시 고정 + 옆에 콘텐츠. 모바일: 사이드바는 오버레이(Sidebar
// 자체가 fixed 처리), 콘텐츠는 기존 460px 단일 컬럼 + 하단 탭바.
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[460px] flex-1 lg:max-w-none lg:pl-[280px]">
      <Sidebar />
      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col bg-page">
        <div className="flex flex-1 flex-col pb-24 lg:pb-6">{children}</div>
        <div className="lg:hidden">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
