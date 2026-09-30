"use client";

// 전역 탭(챗 · 지도 · 저장 · 마이) 사이를 옮길 때의 "방향"을 기억하는 아주 작은 저장소.
//
// 왜 필요한가: 지금까지는 어느 탭을 눌러도 새 화면이 똑같이 아래에서 위로 올라왔다.
// "어느 버튼을 눌렀는지"와 "어느 쪽으로 갔는지"가 화면에 남지 않는다. nav.ts의
// NAV_ITEMS 순서(챗0 · 지도1 · 저장2 · 마이3)에서 부호만 꺼내 두면, 모바일은 좌우로
// 웹은 위아래로 같은 방향 규칙을 쓸 수 있다.
//
// 적용 범위는 "전역 탭"뿐이다. 새 질문 · 대화 기록 · 코스 상세 · 로그인 같은 화면 안
// 이동은 여기를 거치지 않는다(그건 "옆으로 간 것"이 아니라 "안으로 들어간 것"이라
// 기존 sk-page-deep 모션을 그대로 쓴다).

export type NavDir = "fwd" | "back";

// 나가는 모션 길이. 사람이 탭을 누르고 화면 변화를 기다린다고 느끼기 전에 끝나야 한다.
export const EXIT_MS = 120;
// 어떤 이유로든 이동이 일어나지 않았을 때 화면이 사라진 채로 남지 않게 하는 안전장치.
const FAILSAFE_MS = 600;

let dir: NavDir | null = null;
let leaving = false;
let timer: number | null = null;
let failsafe: number | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeNavMotion(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function navDirSnapshot(): NavDir | null {
  return dir;
}

export function leavingSnapshot(): boolean {
  return leaving;
}

export function navServerSnapshot() {
  return null;
}

export function leavingServerSnapshot() {
  return false;
}

// 이동이 끝나면(= 경로가 바뀌면) 나가는 상태만 푼다. 방향은 새로 들어온 화면이
// 써야 하므로 남겨 둔다.
export function endLeave() {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (failsafe !== null) {
    window.clearTimeout(failsafe);
    failsafe = null;
  }
  if (!leaving) return;
  leaving = false;
  emit();
}

// 브라우저 뒤로/앞으로는 우리가 방향을 알 수 없다 — 지난 방향을 재사용하면 거꾸로
// 움직이므로 방향 없이(기존 세로 등장) 돌려놓는다.
export function forgetNavDir() {
  if (dir === null) return;
  dir = null;
  emit();
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", forgetNavDir);
}

// 브라우저 기본 동작을 그대로 둬야 하는 클릭인지 판단한다.
//  - 가운데 클릭 / 우클릭            : 새 탭·컨텍스트 메뉴
//  - Ctrl·Cmd·Shift·Alt             : 새 탭 / 새 창 / 다운로드
//  - detail === 0                   : 키보드(Enter·Space)로 활성화 — 기본 동작 유지
//  - 이미 preventDefault 된 이벤트    : 다른 핸들러가 처리 중
export function keepsNativeNavigation(e: {
  defaultPrevented: boolean;
  button: number;
  detail: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return (
    e.defaultPrevented ||
    e.button !== 0 ||
    e.detail === 0 ||
    e.metaKey ||
    e.ctrlKey ||
    e.shiftKey ||
    e.altKey
  );
}

// 나가는 모션을 켜고, 그게 도는 동안 실제 이동을 시작한다.
// 연속으로 두 번 누르면 먼저 시작한 이동만 진행한다(두 번째는 무시) — 그래야
// 화면이 두 번 빠져나가려다 어긋나지 않는다.
export function beginNav(next: NavDir, run: () => void) {
  if (leaving) return;
  dir = next;
  leaving = true;
  emit();
  timer = window.setTimeout(() => {
    timer = null;
    run();
  }, EXIT_MS);
  failsafe = window.setTimeout(endLeave, FAILSAFE_MS);
}
