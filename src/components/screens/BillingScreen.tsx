"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { ScreenHeader } from "@/components/ScreenHeader";
import { PLANS, type PlanCode } from "@/lib/billing/plans";
import type { QuotaState } from "@/lib/billing/quota";

const ERROR_MESSAGES: Record<string, string> = {
  auth: "로그인이 풀렸어요. 다시 로그인한 뒤 시도해주세요.",
  invalid: "결제 정보를 확인하지 못했어요. 다시 시도해주세요.",
  billing: "카드 등록에 실패했어요. 카드 정보를 확인해주세요.",
  charge: "카드는 등록됐지만 결제에 실패했어요. 다른 카드로 다시 시도해주세요.",
};

// 요금제 화면. 이 화면 자체가 proxy.ts 로그인 게이트 뒤에 있어서 항상 로그인 상태다.
export function BillingScreen({ quota }: { quota: QuotaState }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState<PlanCode | null>(null);
  const [error, setError] = useState("");

  const redirectError = params.get("error");
  const succeeded = params.get("ok") === "1";

  async function subscribe(planCode: PlanCode) {
    setError("");
    setPending(planCode);
    try {
      // 금액은 보내지 않는다 — 서버가 planCode로 PLANS에서 읽는다. 여기서 보낼 수 있는
      // 금액 자체가 없으니 "클라이언트 금액을 믿었다"는 사고가 구조적으로 불가능하다.
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push("/login?next=/billing");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "결제 준비에 실패했어요.");

      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
      if (!clientKey) throw new Error("결제 설정이 완료되지 않았어요.");

      // 구독은 일반 결제가 아니라 빌링키(카드 등록)다 — 등록 후 매월 서버가 승인한다.
      const tossPayments = await loadTossPayments(clientKey);
      const payment = tossPayments.payment({ customerKey: data.customerKey });
      await payment.requestBillingAuth({
        method: "CARD",
        successUrl: `${window.location.origin}/api/billing/confirm`,
        failUrl: `${window.location.origin}/billing?error=billing`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "결제를 시작하지 못했어요.");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <ScreenHeader title="요금제" onBack={() => router.back()} />
      <div className="flex flex-col gap-3 px-5 pb-8">
        {succeeded && (
          <div className="sk-panel border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            구독이 시작됐어요. 이제 늘어난 한도로 추천을 받을 수 있어요.
          </div>
        )}
        {(error || redirectError) && (
          <div className="sk-panel border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error || ERROR_MESSAGES[redirectError ?? ""] || "결제에 실패했어요."}
          </div>
        )}

        <div className="sk-panel px-4 py-3.5">
          <p className="text-[13px] text-muted">현재 이용 중</p>
          <p className="mt-0.5 text-[16px] font-semibold text-ink">
            {quota.tierName} · {quota.used}/{quota.limit}회 사용
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {quota.remaining > 0 ? `${quota.remaining}회 남았어요.` : "한도를 다 쓰셨어요. 아래에서 요금제를 골라주세요."}
          </p>
        </div>

        {(Object.keys(PLANS) as PlanCode[]).map((code) => {
          const plan = PLANS[code];
          const current = quota.planCode === code;
          return (
            <div key={code} className="sk-panel px-4 py-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[16px] font-semibold text-ink">{plan.name}</p>
                <p className="text-[15px] font-semibold text-ink">
                  {plan.priceKrw.toLocaleString("ko-KR")}원<span className="text-[13px] font-medium text-muted"> / 월</span>
                </p>
              </div>
              <p className="mt-1 text-[13px] text-muted">매월 추천 {plan.limit}회</p>
              <button
                onClick={() => subscribe(code)}
                disabled={current || pending !== null}
                className="mt-3 w-full rounded-full bg-cta py-2.5 text-[14px] font-semibold text-white disabled:bg-muted/30 disabled:text-muted"
              >
                {current ? "이용 중" : pending === code ? "결제창 여는 중..." : "카드 등록하고 시작"}
              </button>
            </div>
          );
        })}

        <p className="px-1 text-[12px] leading-relaxed text-muted">
          카드를 등록하면 매월 자동으로 결제돼요. 결제는 토스페이먼츠를 통해 처리되고, 카드 정보는 저희 서버에 저장되지 않아요.
        </p>
      </div>
    </>
  );
}
