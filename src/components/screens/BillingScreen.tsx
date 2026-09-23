"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { ScreenHeader } from "@/components/ScreenHeader";
import { FREE_QUESTIONS, PRICE_PER_QUESTION_KRW, TOPUP_AMOUNT_KRW } from "@/lib/billing/plans";
import type { BalanceState } from "@/lib/billing/quota";

const ERROR_MESSAGES: Record<string, string> = {
  auth: "로그인이 풀렸어요. 다시 로그인한 뒤 시도해주세요.",
  invalid: "결제 정보를 확인하지 못했어요. 다시 시도해주세요.",
  billing: "카드 등록에 실패했어요. 카드 정보를 확인해주세요.",
  charge: "카드는 등록됐지만 충전에 실패했어요. 다른 카드로 다시 시도해주세요.",
};

// 요금제 화면. 이 화면 자체가 proxy.ts 로그인 게이트 뒤에 있어서 항상 로그인 상태다.
// 종량제: 무료 질문 소진 후 건당 차감, 잔액이 모자라면 등록된 카드로 자동충전된다.
export function BillingScreen({ balance }: { balance: BalanceState }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  // 실제로 카드가 긁히는 버튼이라 한 번 더 확인받는다 — 잘못 눌러도 바로 결제되지 않게.
  const [confirmingTopUp, setConfirmingTopUp] = useState(false);

  const redirectError = params.get("error");
  const succeeded = params.get("ok") === "1";

  async function registerCard() {
    setError("");
    setPending(true);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push("/login?next=/billing");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "카드 등록을 준비하지 못했어요.");

      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
      if (!clientKey) throw new Error("결제 설정이 완료되지 않았어요.");

      // 크레딧 충전은 일반 결제가 아니라 빌링키(카드 등록)다 — 한 번 등록해두면
      // 잔액이 모자랄 때 서버가 그 키로 직접 충전한다.
      const tossPayments = await loadTossPayments(clientKey);
      const payment = tossPayments.payment({ customerKey: data.customerKey });
      await payment.requestBillingAuth({
        method: "CARD",
        successUrl: `${window.location.origin}/api/billing/confirm`,
        failUrl: `${window.location.origin}/billing?error=billing`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "카드 등록을 시작하지 못했어요.");
    } finally {
      setPending(false);
    }
  }

  async function topUp() {
    setError("");
    setConfirmingTopUp(false);
    setPending(true);
    try {
      const res = await fetch("/api/billing/topup", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push("/login?next=/billing");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "충전에 실패했어요.");
      router.push("/billing?ok=1");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "충전을 시작하지 못했어요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <ScreenHeader title="크레딧" onBack={() => router.back()} />
      <div className="flex flex-col gap-3 px-5 pb-8">
        {succeeded && (
          <div className="sk-panel border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            충전됐어요. 계속 이용할 수 있어요.
          </div>
        )}
        {(error || redirectError) && (
          <div className="sk-panel border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error || ERROR_MESSAGES[redirectError ?? ""] || "요청에 실패했어요."}
          </div>
        )}

        <div className="sk-panel px-4 py-3.5">
          <p className="text-[13px] text-muted">보유 크레딧</p>
          <p className="mt-0.5 text-[16px] font-semibold text-ink">{balance.balanceKrw.toLocaleString("ko-KR")}원</p>
          <p className="mt-1 text-[13px] text-muted">
            {balance.freeRemaining > 0
              ? `무료 질문 ${balance.freeRemaining}건 남았어요.`
              : `질문 1건당 ${PRICE_PER_QUESTION_KRW.toLocaleString("ko-KR")}원이 차감돼요.`}
          </p>
        </div>

        <div className="sk-panel px-4 py-4">
          {balance.hasBillingKey ? (
            <>
              <p className="text-[14px] text-ink-soft">
                등록된 카드로 {TOPUP_AMOUNT_KRW.toLocaleString("ko-KR")}원을 충전해요. 크레딧이 모자라면 질문할 때
                자동으로도 충전돼요.
              </p>
              {confirmingTopUp ? (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setConfirmingTopUp(false)}
                    disabled={pending}
                    className="flex-1 rounded-full border border-hairline py-2.5 text-[14px] font-semibold text-ink-soft"
                  >
                    취소
                  </button>
                  <button
                    onClick={topUp}
                    disabled={pending}
                    className="flex-1 rounded-full bg-cta py-2.5 text-[14px] font-semibold text-white disabled:bg-muted/30 disabled:text-muted"
                  >
                    {pending ? "충전 중..." : "정말 충전할까요? 확인"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingTopUp(true)}
                  disabled={pending}
                  className="mt-3 w-full rounded-full bg-cta py-2.5 text-[14px] font-semibold text-white disabled:bg-muted/30 disabled:text-muted"
                >
                  {`${TOPUP_AMOUNT_KRW.toLocaleString("ko-KR")}원 충전하기`}
                </button>
              )}
            </>
          ) : (
            <>
              <p className="text-[14px] text-ink-soft">
                무료 질문 {FREE_QUESTIONS}건을 다 쓰면 카드를 등록해야 계속 이용할 수 있어요. 등록해두면 크레딧이
                모자랄 때마다 자동으로 충전돼요.
              </p>
              <button
                onClick={registerCard}
                disabled={pending}
                className="mt-3 w-full rounded-full bg-cta py-2.5 text-[14px] font-semibold text-white disabled:bg-muted/30 disabled:text-muted"
              >
                {pending ? "결제창 여는 중..." : "카드 등록하기"}
              </button>
            </>
          )}
        </div>

        <p className="px-1 text-[12px] leading-relaxed text-muted">
          결제는 토스페이먼츠를 통해 처리되고, 카드 정보는 저희 서버에 저장되지 않아요.
        </p>
      </div>
    </>
  );
}
