"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { BottomNav } from "@/components/BottomNav";
import { useTrackInAppNavigation } from "@/lib/useBack";

// 데스크톱(lg+): 사이드바 상시 고정 + 옆에 콘텐츠. 모바일: 사이드바는 오버레이(Sidebar
// 자체가 fixed 처리), 콘텐츠는 기존 460px 단일 컬럼 + 하단 탭바.
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // 뒤로 버튼이 "앱 안에서 온 곳이 있는지" 판단할 때 쓰는 가벼운 기록(lib/useBack).
  useTrackInAppNavigation();
  // 탭 루트 4개만 "얕은" 화면이다 — 그 밖은 전부 한 단계 들어간 화면으로 본다.
  const isDeep = !["/", "/map", "/saved", "/mypage"].includes(pathname);

  // 관리자 페이지는 데스크톱 웹 전용 도구라 460px 모바일 셸/사이드바/하단탭바가
  // 필요 없다 — 전체 폭 그대로 내려준다.
  if (pathname?.startsWith("/admin")) return <>{children}</>;

  return (
    <div className="mx-auto flex w-full max-w-[460px] flex-1 lg:max-w-none lg:pl-[280px]">
      <Sidebar />
      {/* overflow-x-clip은 안전망이다. 안에서 무언가 하나라도 가로로 삐져나가면
          (LLM이 준 긴 문구, 잘린 적 없는 긴 주소 등) 화면 전체가 가로로 밀리는데,
          모바일에서는 레이아웃 뷰포트가 그 폭까지 넓어져서 가로 스크롤바가 생기고
          화면 아래에 빈 공간까지 딸려온다. clip은 hidden과 달리 스크롤 컨테이너를
          만들지 않아서 아래 입력창의 position:sticky가 그대로 동작한다. */}
      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col overflow-x-clip bg-page">
        {/* 화면이 바뀔 때마다 한 번 올라오며 들어온다 — pathname을 key로 줘서
            라우트가 바뀔 때만 다시 재생된다.
            탭 사이를 옮겨 다니는 것(/ · /map · /saved · /mypage)과 거기서 한 단계
            들어가는 것(/recommend/…, /place/…)은 무게가 다르다. 얕은 이동은 짧게,
            깊은 진입은 조금 더 길고 살짝 앞으로 나오게 해서 "안으로 들어왔다"가
            몸으로 읽히게 한다. */}
        <div
          key={pathname}
          className={`${isDeep ? "sk-page-deep" : "sk-page"} flex flex-1 flex-col pb-[calc(var(--sk-dock)+12px+env(safe-area-inset-bottom))] lg:pb-6`}
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
