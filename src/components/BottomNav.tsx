"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { useAppStore } from "@/lib/store";

// 모바일 전용(데스크톱은 AppShell이 lg:hidden으로 감싼다) — 사이드바 화면(홈/채팅/마이)에서만 노출.
// "추천"(/recommend) 탭은 "지도" 탭으로 교체됨(디자인/지도.png) — /recommend/[runId]는
// 여전히 "코스 상세 보기"로 드릴다운하는 화면이라 이제 홈 활성 상태로 묶는다.
const RESULTS_PATH = /^\/recommend(\/|$)/;
const MAP_PATH = /^\/map(\/|$)/;
const SAVED_PATH = /^\/saved(\/|$)/;
// 장소 검색(홈)에서 들어가는 단독 상세/주차 화면 — /recommend/[runId]/place/... 와 같은 패턴.
const SEARCHED_PLACE_PATH = /^\/place(\/|$)/;

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const lastRecommendation = useAppStore((s) => s.lastRecommendation);
  const onRecommend = RESULTS_PATH.test(pathname);
  const onMap = MAP_PATH.test(pathname);
  const onSaved = SAVED_PATH.test(pathname);
  const onSearchedPlace = SEARCHED_PLACE_PATH.test(pathname);
  const show = pathname === "/" || onRecommend || onMap || onSaved || onSearchedPlace || pathname === "/mypage";
  if (!show) return null;

  // 방금 받은 추천이 있으면(store, 새로고침하면 사라짐) 그 코스로, 없으면 빈 상태로.
  // "코스 상세 보기"(openCourseDetail)와 같은 패턴 — 캐시를 미리 채워 재요청 없이 바로 뜬다.
  function goToMap() {
    if (lastRecommendation) {
      queryClient.setQueryData(["recommend", lastRecommendation.agentRunId], lastRecommendation);
      router.push(`/map/${lastRecommendation.agentRunId}`);
    } else {
      router.push("/map");
    }
  }

  const tabs = [
    { id: "home", label: "홈", icon: "home", href: "/", active: pathname === "/" || onSearchedPlace || onRecommend },
    { id: "map", label: "지도", icon: "pin", onClick: goToMap, active: onMap },
    { id: "saved", label: "저장", icon: "bookmark", href: "/saved", active: onSaved },
    { id: "mypage", label: "마이", icon: "user", href: "/mypage", active: pathname === "/mypage" },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-[460px] -translate-x-1/2 items-center justify-around border-t border-hairline bg-white/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur">
      {tabs.map((tab) => {
        const className = `flex flex-1 flex-col items-center gap-1 py-1 text-[11px] font-medium ${
          tab.active ? "text-accent" : "text-slate-400"
        }`;
        const content = (
          <>
            <Icon name={tab.icon} className="h-[22px] w-[22px]" />
            {tab.label}
          </>
        );
        return "onClick" in tab ? (
          <button key={tab.id} onClick={tab.onClick} className={className}>
            {content}
          </button>
        ) : (
          <Link key={tab.id} href={tab.href} className={className}>
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
