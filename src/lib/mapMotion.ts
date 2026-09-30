"use client";

// 지도 오버레이(Polyline) 전용 모션.
//
// 원칙 세 가지 — 지도는 성능에 민감해서 여기부터 정하고 시작했다.
//  1) 지도 canvas·root는 건드리지 않는다. CSS transform을 지도에 걸면 마커 좌표와
//     포인터 좌표가 어긋나므로, 선은 반드시 Naver Maps API(setOptions/setPath)로만 움직인다.
//  2) requestAnimationFrame 루프를 쓰지 않는다. 지도가 pan/zoom 중일 때 매 프레임
//     오버레이를 다시 그리면 눈에 띄게 끊긴다. 대신 "정해진 횟수"만 setTimeout으로 밟는다.
//  3) 횟수는 경로 점 개수와 무관하게 상한이 있다. 점이 800개인 경로도 14번만 갱신한다.
//
// 모든 함수는 취소 함수를 돌려준다 — 구간이 빨리 바뀌면 앞 시퀀스는 즉시 접고
// 최종 상태로 끝낸다(중간 상태로 멈춰 있으면 안 된다).

type Cancel = () => void;

export type PolylineLike = {
  setOptions: (o: Record<string, unknown>) => void;
  setPath: (path: unknown[]) => void;
};

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// 한 번만 실행되는 계단식 타이머. step(i, last)를 steps번 호출하고 끝낸다.
// 취소하면 남은 타이머를 버리고 마지막 단계를 즉시 한 번 실행한다 —
// "중간 투명도에서 멈춘 선"이 남지 않게 하려는 것이다.
function ladder(steps: number, ms: number, step: (i: number) => void): Cancel {
  let timer = 0;
  let i = 0;
  let done = false;
  const gap = Math.max(16, Math.round(ms / steps));

  const tick = () => {
    i += 1;
    step(i);
    if (i >= steps) {
      done = true;
      return;
    }
    timer = window.setTimeout(tick, gap);
  };

  step(0);
  timer = window.setTimeout(tick, gap);

  return () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
    if (!done) {
      done = true;
      step(steps); // 못 밟은 만큼은 건너뛰고 최종 상태로
    }
  };
}

// 선의 짙기가 옮겨간다 — 전체 코스 경로용.
//
// 두 가지 용도가 같은 함수다.
//  · 처음 그릴 때: 0 → 0.85. 선은 이미 그려져 있고 짙기만 올라오므로 정보가 늦지 않는다.
//  · 구간을 고를 때: 0.85 → 0.3. 전체 경로가 뒤로 물러나고 현재 구간이 앞으로 나온다.
export function rampRouteOpacity(poly: PolylineLike, from: number, to: number, ms = 240): Cancel {
  if (from === to) {
    poly.setOptions({ strokeOpacity: to });
    return () => {};
  }
  if (prefersReducedMotion()) {
    poly.setOptions({ strokeOpacity: to });
    return () => {};
  }
  const steps = 6;
  return ladder(steps, ms, (i) => {
    poly.setOptions({ strokeOpacity: from + (to - from) * (i / steps) });
  });
}

// 선이 그어진다 — 현재 구간 강조용. 출발점에서 도착점 쪽으로 경로가 자라난다.
// 이게 M2 코스 카드의 "1 → 선 → 2"를 지도에서 잇는 부분이다.
//
// 점 개수와 무관하게 최대 MAX_STEPS번만 setPath한다. 점이 적으면(직선 구간)
// 점 개수만큼만 밟아서 같은 좌표를 두 번 그리지 않는다.
const MAX_STEPS = 14;

export function drawRoute(poly: PolylineLike, path: unknown[], ms = 360): Cancel {
  if (path.length < 2) {
    poly.setPath(path);
    return () => {};
  }
  if (prefersReducedMotion()) {
    poly.setPath(path);
    return () => {};
  }
  const steps = Math.min(MAX_STEPS, path.length - 1);
  return ladder(steps, ms, (i) => {
    // i=0일 때도 최소 두 점은 둔다 — 한 점짜리 선은 네이버가 그리지 않아서
    // 첫 프레임이 깜빡이는 것처럼 보인다.
    const n = Math.max(2, Math.round((path.length * i) / steps));
    poly.setPath(path.slice(0, n));
  });
}
