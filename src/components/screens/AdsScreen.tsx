"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenHeader } from "@/components/ScreenHeader";
import type { AdQuotaState } from "@/lib/ads/quota";

const WATCH_SECONDS = 15;

// AdSense 계정/승인 전이라 슬롯 ID가 없으면 자리만 잡아둔 플레이스홀더를 보여준다.
// 계정 생기면 .env에 두 값만 채우면 실제 광고가 뜬다(이 컴포넌트는 안 고쳐도 됨).
const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
const ADSENSE_SLOT = process.env.NEXT_PUBLIC_ADSENSE_AD_SLOT;

function AdUnit() {
  if (!ADSENSE_CLIENT || !ADSENSE_SLOT) {
    return (
      <div className="flex h-[250px] items-center justify-center rounded-xl bg-slate-100 text-[13px] text-muted">
        광고 준비 중이에요
      </div>
    );
  }
  return (
    <ins
      className="adsbygoogle block h-[250px]"
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={ADSENSE_SLOT}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}

export function AdsScreen({ quota }: { quota: AdQuotaState }) {
  const router = useRouter();
  const [credits, setCredits] = useState(quota.credits);
  const [watching, setWatching] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(WATCH_SECONDS);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [succeeded, setSucceeded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!watching) return;
    // adsbygoogle 스크립트가 로드돼 있으면 슬롯을 채우도록 알린다(광고 계정 있을 때만 동작).
    try {
      (window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle?.push({});
    } catch {
      // 계정 없으면 조용히 무시 — 플레이스홀더만 보인다.
    }
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [watching]);

  function startWatching() {
    setError("");
    setSucceeded(false);
    setSecondsLeft(WATCH_SECONDS);
    setWatching(true);
  }

  function cancelWatching() {
    if (timerRef.current) clearInterval(timerRef.current);
    setWatching(false);
  }

  async function claimReward() {
    setError("");
    setPending(true);
    try {
      const res = await fetch("/api/ads/reward", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push("/login?next=/ads");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "질문권을 받지 못했어요.");
      setCredits(data.credits ?? credits + 1);
      setSucceeded(true);
      setWatching(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "질문권을 받지 못했어요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <ScreenHeader title="질문권" onBack={() => router.back()} />
      <div className="flex flex-col gap-3 px-5 pb-8">
        {succeeded && (
          <div className="sk-panel border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            질문권을 받았어요.
          </div>
        )}
        {error && (
          <div className="sk-panel border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="sk-panel px-4 py-3.5">
          <p className="text-[13px] text-muted">보유 질문권</p>
          <p className="mt-0.5 text-[16px] font-semibold text-ink">{credits}개</p>
          <p className="mt-1 text-[13px] text-muted">
            {quota.freeAvailableToday
              ? "오늘 무료 질문이 아직 남았어요."
              : "오늘 무료 질문은 다 쓰셨어요. 광고를 보면 질문권을 더 받을 수 있어요."}
          </p>
        </div>

        {watching ? (
          <div className="sk-panel px-4 py-4">
            <AdUnit />
            <div className="mt-3">
              {secondsLeft > 0 ? (
                <>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-cta transition-[width]"
                      style={{ width: `${((WATCH_SECONDS - secondsLeft) / WATCH_SECONDS) * 100}%` }}
                    />
                  </div>
                  <p className="mt-2 text-center text-[13px] text-muted">{secondsLeft}초 후 질문권을 받을 수 있어요</p>
                  <button
                    onClick={cancelWatching}
                    className="mt-3 w-full rounded-full border border-hairline py-2.5 text-[14px] font-semibold text-ink-soft"
                  >
                    닫기
                  </button>
                </>
              ) : (
                <button
                  onClick={claimReward}
                  disabled={pending}
                  className="mt-3 w-full rounded-full bg-cta py-2.5 text-[14px] font-semibold text-white disabled:bg-muted/30 disabled:text-muted"
                >
                  {pending ? "받는 중..." : "질문권 받기"}
                </button>
              )}
            </div>
          </div>
        ) : (
          <button
            onClick={startWatching}
            className="rounded-full bg-cta py-3 text-[15px] font-semibold text-white"
          >
            광고 보고 질문권 받기
          </button>
        )}

        <p className="px-1 text-[12px] leading-relaxed text-muted">
          광고 하나를 끝까지 보면 질문권 1개를 받아요. 받을 수 있는 개수에 제한은 없어요.
        </p>
      </div>
    </>
  );
}
