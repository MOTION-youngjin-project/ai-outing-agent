"use client";

import { useEffect, useRef, useState } from "react";

// 긴 화면(마이페이지·저장)에서 "스크롤하면 그 자리에서 자리를 잡는" 등장.
//
// 규칙은 셋이다.
//  1) 한 번만 — 위아래로 스크롤할 때마다 다시 재생되면 읽는 걸 방해한다.
//  2) 관찰자는 하나만 — 줄마다 IntersectionObserver를 만들면 긴 목록에서 비싸다.
//     모듈 하나가 공용 관찰자를 갖고, 들어온 요소는 바로 관찰에서 뺀다.
//  3) 화면 안에 이미 있으면 기다리지 않는다 — 빠르게 스크롤해도 빈 자리가 생기면 안 되므로
//     아래쪽 여유(180px)를 두고 미리 켠다.
//
// 실제 움직임은 전부 CSS(data-reveal)에 있다. 여기서는 그 표식만 켠다.

let observer: IntersectionObserver | null = null;

function sharedObserver(): IntersectionObserver | null {
  if (typeof window === "undefined" || !("IntersectionObserver" in window)) return null;
  if (observer) return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).dataset.reveal = "in";
        observer?.unobserve(entry.target);
      }
    },
    // 아래로 180px 먼저 켠다 — 화면에 닿기 전에 준비가 끝난다.
    { rootMargin: "0px 0px 180px 0px", threshold: 0.01 },
  );
  return observer;
}

export function useReveal<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.dataset.reveal === "in") return;
    const ob = sharedObserver();
    if (!ob) {
      // 관찰자가 없는 환경(구형 브라우저)에서는 그냥 바로 보여준다.
      el.dataset.reveal = "in";
      return;
    }
    const box = el.getBoundingClientRect();
    if (box.top < window.innerHeight + 180 && box.bottom > 0) {
      el.dataset.reveal = "in";
      return;
    }
    ob.observe(el);
    return () => ob.unobserve(el);
  }, []);
  return ref;
}

// 통계 숫자가 0에서 실제 값까지 한 번 올라간다.
//
// 슬롯머신처럼 돌리지 않는다 — 한 방향으로 한 번, ease-out으로 감속하며 멈춘다.
// 값이 0이면 셀 것이 없으므로 아무것도 하지 않고, prefers-reduced-motion이면
// 처음부터 최종값을 보여준다(정보가 늦게 뜨면 안 된다).
export function useCountUp(target: number, ms = 480): number {
  // null이면 "아직 세지 않는다" — 그때는 실제 값을 그대로 보여준다. useState의 초기값은
  // 첫 렌더에만 쓰이므로, 값이 나중에 도착하는 경우(쿼리 로딩)에 초기값을 붙들고 있으면
  // reduced-motion에서 0이 그대로 남는다(실측).
  const [shown, setShown] = useState<number | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    if (typeof window === "undefined") return;
    if (!target) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    started.current = true;

    let raf = 0;
    const t0 = performance.now();
    const tick = () => {
      // rAF가 주는 시각 대신 같은 시계(performance.now)를 쓰고 0~1로 가둔다 —
      // 시계가 어긋나면 진행도가 음수가 되어 숫자가 거꾸로 튄다(실측).
      const p = Math.min(1, Math.max(0, (performance.now() - t0) / ms));
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);

  return shown ?? target;
}
