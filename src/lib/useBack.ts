"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// 화면의 "뒤로" 버튼 — 사용자가 실제로 들어온 화면으로 돌아간다.
//
// 예전엔 화면마다 router.push(고정 경로)였다. 그래서 지도에서 연 장소 상세의 뒤로가
// 코스 상세로, 저장 탭에서 연 장소의 뒤로가 홈으로 갔고, push라 히스토리가 쌓여서
// WebView 하드웨어 뒤로와 화면 뒤로가 서로 다른 곳을 가리켰다.
//
// 원칙: 앱 안에서 이동해 온 기록이 있으면 브라우저 back(= 하드웨어 뒤로와 같은 동작),
// 없으면(직링크·공유 링크·새 탭) 정보 구조상 한 단계 위로 replace 한다. replace라
// 그 뒤 하드웨어 뒤로는 앱 밖으로 나간다 — 존재하지 않는 "이전 화면"을 만들지 않는다.
//
// "앱 안 기록이 있는가"는 브라우저가 이미 알고 있다: Navigation API의
// navigation.canGoBack은 같은 출처(우리 앱)의 이전 기록이 있을 때만 true다
// (다른 사이트에서 링크로 들어온 경우 false, 새로고침해도 이전 기록은 유지).
// Android WebView(Chromium)와 크롬은 지원한다. 지원하지 않는 브라우저에서만 아래의
// 가벼운 경로 기록으로 대신 판단한다 — 새로고침하면 비워지므로, 틀려도
// "뒤로 대신 fallback으로 간다" 쪽으로만 틀린다(앱 밖으로 튕기지 않는다).

// 앱 안에서 지나온 경로들(모듈 변수 — 새로고침하면 비워진다).
// 새 경로가 바로 앞 경로와 같으면 "뒤로 온 것"으로 보고 하나 뺀다. popstate 이벤트로
// 판단하지 않는 이유: Next 라우터가 popstate를 먼저 처리하면서 경로를 바꿔버려,
// 우리 리스너보다 경로 변화가 먼저 도착한다(실측). 링크로 바로 앞 화면에 다시 간
// 경우도 "뒤로"로 세는데, 그러면 뒤로 버튼이 fallback을 쓰게 될 뿐이라 안전하다.
const trail: string[] = [];
let replacePending = false;

// 경로를 바꾸는 router.replace 직전에 부른다 — 카운터가 "새 화면"으로 세지 않게.
export function noteReplace() {
  replacePending = true;
}

// AppShell에서 한 번만 부른다.
export function useTrackInAppNavigation() {
  const pathname = usePathname();
  useEffect(() => {
    const last = trail[trail.length - 1];
    if (last === pathname) return;
    if (trail.length >= 2 && trail[trail.length - 2] === pathname) trail.pop();
    else if (replacePending && trail.length > 0) trail[trail.length - 1] = pathname;
    else trail.push(pathname);
    replacePending = false;
  }, [pathname]);
}

export function canGoBackInApp(): boolean {
  if (typeof window === "undefined") return false;
  const nav = (window as unknown as { navigation?: { canGoBack?: unknown } }).navigation;
  if (nav && typeof nav.canGoBack === "boolean") return nav.canGoBack;
  return trail.length > 1;
}

export function useBack(fallback: string) {
  const router = useRouter();
  return () => {
    if (canGoBackInApp()) {
      router.back();
    } else {
      noteReplace();
      router.replace(fallback);
    }
  };
}
