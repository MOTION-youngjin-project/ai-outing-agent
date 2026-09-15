"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { useAppStore } from "@/lib/store";

// 나들플랜 안드로이드 앱(webview_flutter)이 WebView User-Agent 뒤에 붙이는 식별자.
// 앱 안에서 열렸을 때는 네이티브 탭바와 중복되는 이 웹 자체 네비를 숨긴다.
const NATIVE_APP_UA_MARKER = "NadeulPlanApp";

// UA는 마운트 이후에만(클라이언트에서만) 읽을 수 있고 이후 바뀌지 않으니, 구독이 필요 없는
// useSyncExternalStore로 서버/클라이언트 스냅샷을 분리한다 — 하이드레이션 mismatch 없이.
function subscribeNever() {
  return () => {};
}
function isNativeAppSnapshot() {
  return navigator.userAgent.includes(NATIVE_APP_UA_MARKER);
}
function isNativeAppServerSnapshot() {
  return false;
}

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

  const isNativeApp = useSyncExternalStore(subscribeNever, isNativeAppSnapshot, isNativeAppServerSnapshot);

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

  // 나들플랜 앱의 네이티브 하단 탭바가 탭 눌릴 때 던지는 추상 이벤트를 받아 실제 라우팅을
  // 결정한다 — 어느 URL로 갈지는 각 탭 버튼과 동일한 로직(goToMap 등)을 그대로 재사용.
  useEffect(() => {
    function handleNativeTab(event: Event) {
      const tab = (event as CustomEvent<string>).detail;
      if (tab === "map") goToMap();
      else if (tab === "chat") router.push("/");
      else if (tab === "saved") router.push("/saved");
      else if (tab === "mypage") router.push("/mypage");
    }
    window.addEventListener("native-tab", handleNativeTab);
    return () => window.removeEventListener("native-tab", handleNativeTab);
  });

  if (!show || isNativeApp) return null;

  const tabs = [
    { id: "home", label: "챗", icon: "chat", href: "/", active: pathname === "/" || onSearchedPlace || onRecommend },
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
