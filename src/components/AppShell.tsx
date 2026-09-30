"use client";

import { useEffect, useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { BottomNav } from "@/components/BottomNav";
import { ActiveTripPanel } from "@/components/ActiveTripPanel";
import { useTrackInAppNavigation } from "@/lib/useBack";
import {
  subscribeNavMotion,
  navDirSnapshot,
  leavingSnapshot,
  navServerSnapshot,
  leavingServerSnapshot,
  endLeave,
} from "@/lib/navMotion";

// 틀(폭·자리)은 globals.css의 .sk-shell / .sk-main / .sk-side이 들고 있다.
//  ~767   모바일    : 본문 460 · 사이드바는 서랍 · 하단 탭바
//  768~   태블릿    : 본문 600 · 서랍 · 하단 탭바
//  1024~  웹 compact: 본문 760 · 아이콘 레일(기본 접힘) · 탭바 없음
//  1200~  데스크톱  : 본문 760 · 레일 256(접으면 68) · 탭바 없음
// 여기서는 "사용자가 직접 고른 레일 상태"만 data-rail로 내려준다 — 고르지 않았으면
// 화면 폭별 기본값(CSS)이 그대로 쓰인다.

export type RailChoice = "expanded" | "collapsed" | null;

const RAIL_KEY = "napl:sidebarRail";

// 레일 상태는 이 화면 밖으로 나갈 일이 없고 서버에도 저장하지 않는다. 서버 렌더와
// 클라이언트 첫 렌더가 어긋나지 않게(useSyncExternalStore) 모듈 스토어로 둔다.
let railChoice: RailChoice = null;
let railLoaded = false;
const railListeners = new Set<() => void>();

function readStoredRail(): RailChoice {
  try {
    const value = window.localStorage.getItem(RAIL_KEY);
    return value === "expanded" || value === "collapsed" ? value : null;
  } catch {
    return null;
  }
}

function railSnapshot(): RailChoice {
  if (!railLoaded) {
    railLoaded = true;
    railChoice = readStoredRail();
  }
  return railChoice;
}

function railServerSnapshot(): RailChoice {
  return null;
}

function subscribeRail(onChange: () => void) {
  railListeners.add(onChange);
  return () => railListeners.delete(onChange);
}

function setRail(next: RailChoice) {
  railChoice = next;
  railLoaded = true;
  try {
    if (next) window.localStorage.setItem(RAIL_KEY, next);
    else window.localStorage.removeItem(RAIL_KEY);
  } catch {
    // 저장이 막혀 있어도(사생활 보호 모드 등) 이번 세션 동안은 그대로 동작한다.
  }
  railListeners.forEach((listener) => listener());
}

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
      document.documentElement.style.setProperty("--sk-safe-b", "0px");
    }
  }, []);
  // 탭 루트 4개만 "얕은" 화면이다 — 그 밖은 전부 한 단계 들어간 화면으로 본다.
  const isDeep = !["/", "/map", "/saved", "/mypage"].includes(pathname);
  const rail = useSyncExternalStore(subscribeRail, railSnapshot, railServerSnapshot);
  // 전역 탭 이동의 방향과 "나가는 중"인지. 둘 다 화면 밖으로 나갈 일이 없는 값이라
  // 모듈 스토어에 두고 여기서만 읽는다(lib/navMotion).
  const navDir = useSyncExternalStore(subscribeNavMotion, navDirSnapshot, navServerSnapshot);
  const leaving = useSyncExternalStore(subscribeNavMotion, leavingSnapshot, leavingServerSnapshot);

  // 경로가 실제로 바뀌면 "나가는 중"은 끝난다(방향은 새 화면이 써야 하므로 남긴다).
  useEffect(() => {
    endLeave();
  }, [pathname]);

  // 관리자 페이지는 데스크톱 웹 전용 도구라 460px 모바일 셸/사이드바/하단탭바가
  // 필요 없다 — 전체 폭 그대로 내려준다.
  if (pathname?.startsWith("/admin")) return <>{children}</>;

  // 고르지 않은 상태에서 누르면 지금 화면의 기본값 반대쪽으로 간다
  // (1024~1199는 기본 접힘, 1200~은 기본 펼침).
  function toggleRail() {
    if (rail === "expanded") setRail("collapsed");
    else if (rail === "collapsed") setRail("expanded");
    else setRail(window.innerWidth >= 1200 ? "collapsed" : "expanded");
  }

  return (
    <div className="sk-shell" data-rail={rail ?? undefined}>
      <Sidebar onToggleRail={toggleRail} />
      {/* overflow-x-clip은 안전망이다. 안에서 무언가 하나라도 가로로 삐져나가면
          (LLM이 준 긴 문구, 잘린 적 없는 긴 주소 등) 화면 전체가 가로로 밀리는데,
          모바일에서는 레이아웃 뷰포트가 그 폭까지 넓어져서 가로 스크롤바가 생기고
          화면 아래에 빈 공간까지 딸려온다. clip은 hidden과 달리 스크롤 컨테이너를
          만들지 않아서 아래 입력창의 position:sticky가 그대로 동작한다. */}
      <div className="sk-main overflow-x-clip bg-page">
        {/* 화면이 바뀔 때마다 한 번 올라오며 들어온다 — pathname을 key로 줘서
            라우트가 바뀔 때만 다시 재생된다.
            탭 사이를 옮겨 다니는 것(/ · /map · /saved · /mypage)과 거기서 한 단계
            들어가는 것(/recommend/…, /place/…)은 무게가 다르다. 얕은 이동은 짧게,
            깊은 진입은 조금 더 길고 살짝 앞으로 나오게 해서 "안으로 들어왔다"가
            몸으로 읽히게 한다. */}
        {/* 움직이는 건 이 칸 하나뿐이다 — 하단 탭바(fixed)와 사이드바(fixed)는 이
            바깥에 있어서 transform의 영향을 받지 않는다. 등장 애니메이션은 끝나면
            transform을 남기지 않으므로(fill 없음) 안쪽 sticky 입력창·지도도 평소와 같다.
            data-dir가 있을 때만 방향이 있는 전환을 쓰고, 없으면(직링크·뒤로가기·
            상세 진입) 기존 세로 등장 그대로다. */}
        <div
          key={pathname}
          data-dir={!isDeep && navDir ? navDir : undefined}
          className={`${isDeep ? "sk-page-deep" : "sk-page"}${leaving ? " sk-leave" : ""} flex flex-1 flex-col pb-[calc(var(--sk-dock)+12px+var(--sk-safe-b))] lg:pb-6`}
        >
          <ActiveTripPanel />
          {children}
        </div>
        <div className="lg:hidden">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
