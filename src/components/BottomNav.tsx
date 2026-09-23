"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { useAppStore } from "@/lib/store";
import { noteReplace } from "@/lib/useBack";

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
  // navigate: 기본은 push(브라우저 자체 하단 네비 클릭). 나들플랜 앱의 네이티브 탭 전환은
  // replace로 호출해서 탭을 오갈 때마다 히스토리가 쌓이지 않게 한다 — 안 그러면 네이티브 뒤로가기가
  // 실제 뒤로가기 대신 탭 전환을 한 단계씩 되돌리고, Flutter의 탭 선택 표시도 웹 콘텐츠와 어긋난다.
  function goToMap(navigate: typeof router.push = router.push) {
    if (lastRecommendation) {
      queryClient.setQueryData(["recommend", lastRecommendation.agentRunId], lastRecommendation);
      navigate(`/map/${lastRecommendation.agentRunId}`);
    } else {
      navigate("/map");
    }
  }

  // 나들플랜 앱의 네이티브 하단 탭바가 탭 눌릴 때 던지는 추상 이벤트를 받아 실제 라우팅을
  // 결정한다 — 어느 URL로 갈지는 각 탭 버튼과 동일한 로직(goToMap 등)을 그대로 재사용.
  useEffect(() => {
    function handleNativeTab(event: Event) {
      const tab = (event as CustomEvent<string>).detail;
      noteReplace();
      if (tab === "map") goToMap(router.replace);
      else if (tab === "chat") router.replace("/");
      else if (tab === "saved") router.replace("/saved");
      else if (tab === "mypage") router.replace("/mypage");
    }
    window.addEventListener("native-tab", handleNativeTab);
    return () => window.removeEventListener("native-tab", handleNativeTab);
  });

  if (!show || isNativeApp) return null;

  const tabs = [
    { id: "home", label: "챗", icon: "chat", href: "/", active: pathname === "/" || onSearchedPlace || onRecommend },
    { id: "map", label: "지도", icon: "pin", onClick: () => goToMap(), active: onMap },
    { id: "saved", label: "저장", icon: "bookmark", href: "/saved", active: onSaved },
    { id: "mypage", label: "마이", icon: "user", href: "/mypage", active: pathname === "/mypage" },
  ] as const;

  // 선택된 탭 아래로 트랙 하나가 미끄러져 옮겨간다 — 탭마다 따로 켜지는 게 아니라
  // 같은 트랙이 이동하는 것이라 "어디서 어디로 갔는지"가 눈에 남는다.
  // 탭은 flex-1이라 폭이 균등하므로 index * (100/탭수)%로 정확히 맞는다.
  const activeIndex = tabs.findIndex((t) => t.active);

  return (
    // 현재 탭은 sk-navitem[aria-current]로 3px 솟아오르고 아이콘이 한 번 튄다 —
    // 색을 지워도 "어느 탭에 있는지"가 높이와 트랙 위치로 읽힌다.
    // left-1/2 + -translate-x-1/2로 가운데 정렬하면 모바일 Chrome에서 주소창이
    // 접히고 펼쳐질 때 레이아웃 뷰포트 폭 계산이 어긋나 한쪽에 빈 공간이 생기는
    // 경우가 있다(실사용자 실측: 오른쪽이 비어 보임) — inset-x-0 + mx-auto는 같은
    // 컨테이닝 블록의 양쪽 끝에 직접 붙기 때문에 이 문제를 겪지 않는다.
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-[460px] items-end justify-around border-t border-hairline bg-white/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      <span aria-hidden className="sk-navrail">
        <i
          style={{
            width: `${100 / tabs.length}%`,
            transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`,
            opacity: activeIndex < 0 ? 0 : 1,
          }}
        />
      </span>
      {tabs.map((tab) => {
        const className = `sk-navitem flex flex-1 flex-col items-center gap-1 px-1 py-1.5 text-[11px] ${
          tab.active ? "font-bold" : "font-medium text-slate-400"
        }`;
        const content = (
          <>
            <Icon name={tab.icon} className="h-[22px] w-[22px]" />
            {tab.label}
          </>
        );
        return "onClick" in tab ? (
          <button
            key={tab.id}
            onClick={tab.onClick}
            aria-current={tab.active ? "page" : undefined}
            className={className}
          >
            {content}
          </button>
        ) : (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={className}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
