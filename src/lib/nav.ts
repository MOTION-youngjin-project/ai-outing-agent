// 전역 내비게이션 한 벌 — 화면 크기와 무관하게 "같은 네 곳"을 가리킨다.
//
// 예전엔 데스크톱 사이드바가 자기만의 목록(DESKTOP_NAV)을 따로 갖고 있었다. 그래서
// 모바일 하단 탭과 항목 수·이름·아이콘이 다 달랐고("지도"가 데스크톱에서는 "추천"이었다),
// "저장"의 href가 /mypage로 잘못 박혀 있어 저장을 누르면 마이페이지가 떴다.
// 이제 사이드바(접힘·펼침 양쪽)가 이 한 벌만 쓴다 — 두 상태가 어긋날 수 없다.
//
// 기준은 정상 동작 중인 모바일 하단 탭(components/BottomNav.tsx의 tabs)이다. label·icon·
// 목적지·활성 판별을 그대로 옮겨 적었다. BottomNav 자체는 건드리지 않는다.

export type NavItemId = "home" | "map" | "saved" | "mypage";

export type NavItem = {
  id: NavItemId;
  label: string;
  icon: string;
  href: string;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { id: "home", label: "챗", icon: "chat", href: "/" },
  // 지도는 "방금 본 코스가 있으면 그 코스 지도로"가 기본이다(BottomNav.goToMap과 같은 규칙) —
  // href는 코스가 없을 때의 목적지이자, 새 탭으로 열었을 때의 안전한 기본값이다.
  { id: "map", label: "지도", icon: "pin", href: "/map" },
  { id: "saved", label: "저장", icon: "bookmark", href: "/saved" },
  { id: "mypage", label: "마이", icon: "user", href: "/mypage" },
];

// 활성 판별도 하단 탭과 같은 규칙이다.
//  - /recommend/… (코스 상세)와 /place/… (장소 상세)는 홈에서 파고든 화면이라 "챗"으로 묶는다.
//  - /map/[runId], /saved/[publicId] 같은 하위 경로도 각자의 탭으로 묶는다.
const RESULTS_PATH = /^\/recommend(\/|$)/;
const MAP_PATH = /^\/map(\/|$)/;
const SAVED_PATH = /^\/saved(\/|$)/;
const SEARCHED_PLACE_PATH = /^\/place(\/|$)/;

// 전역 탭 사이 이동의 "방향" — 목록 순서(챗0 · 지도1 · 저장2 · 마이3)에서 부호만 꺼낸다.
// 같은 탭이거나 지금 어느 탭인지 모르면(상세 화면 등) 방향 없음.
export function navDirection(from: NavItemId | null, to: NavItemId): "fwd" | "back" | null {
  if (!from || from === to) return null;
  const a = NAV_ITEMS.findIndex((i) => i.id === from);
  const b = NAV_ITEMS.findIndex((i) => i.id === to);
  if (a < 0 || b < 0) return null;
  return b > a ? "fwd" : "back";
}

export function activeNavId(pathname: string): NavItemId | null {
  if (MAP_PATH.test(pathname)) return "map";
  if (SAVED_PATH.test(pathname)) return "saved";
  if (pathname === "/mypage") return "mypage";
  if (pathname === "/" || RESULTS_PATH.test(pathname) || SEARCHED_PLACE_PATH.test(pathname)) return "home";
  return null;
}
