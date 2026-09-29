"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { BottomNav } from "@/components/BottomNav";
import { useTrackInAppNavigation } from "@/lib/useBack";

// 나들플랜 안드로이드 앱(webview_flutter)이 WebView User-Agent 뒤에 붙이는 식별자.
// BottomNav.tsx의 같은 상수와 중복이지만, 용도가 다르다(여긴 CSS 변수를 끄는 부수효과,
// 거긴 렌더링 여부) — 하나로 묶으면 오히려 "왜 이 상수를 쓰는지" 문맥이 흐려진다.
const NATIVE_APP_UA_MARKER = "NadeulPlanApp";

// 데스크톱(lg+): 사이드바 상시 고정 + 옆에 콘텐츠. 모바일: 사이드바는 오버레이(Sidebar
// 자체가 fixed 처리), 콘텐츠는 기존 460px 단일 컬럼 + 하단 탭바.
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // 뒤로 버튼이 "앱 안에서 온 곳이 있는지" 판단할 때 쓰는 가벼운 기록(lib/useBack).
  useTrackInAppNavigation();

  // 앱 안에서는 BottomNav가 null을 렌더링해 자리를 안 차지하는데, --sk-dock(76px)은
  // 웹의 BottomNav 실측값이라 이 페이지 하단 여백과 InputScreen의 sticky 입력창,
  // ParkingScreen의 지도 높이 계산이 전부 실제로 없는 탭바만큼 공간을 남겨뒀다 —
  // 그 틈만큼 입력창이 화면 하단에서 떠 보이고(계속 보고된 버그), 주차 지도+시트
  // 높이도 그만큼 짧게 잘렸다. 세 곳 모두 이 변수 하나를 참조하니 여기서 한 번만
  // 0으로 낮추면 전부 같이 맞는다.
  useLayoutEffect(() => {
    if (navigator.userAgent.includes(NATIVE_APP_UA_MARKER)) {
      document.documentElement.style.setProperty("--sk-dock", "0px");
    }
  }, []);
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
