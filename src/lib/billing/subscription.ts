import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { PERIOD_DAYS, PLANS, parsePlanCode } from "./plans";
import { chargeWithBillingKey, TossError } from "./toss";
import type { Subscription } from "../../../generated/prisma/client";

// 승인 1회. 첫 결제와 갱신 결제가 **같은 함수**를 탄다 — 돈이 나가는 경로가 둘이면
// 한쪽만 고치는 실수가 난다.
//
// 순서가 중요하다: Payment 행을 pending으로 **먼저** 만들고 그 orderId를 멱등키로 쓴다.
// 승인 요청을 보내고 응답을 못 받는 경우가 실제로 있는데, 행을 나중에 만들면 그때 무슨
// 요청이 나갔는지 알 방법이 없다.
export async function chargeSubscription(sub: Subscription, customerEmail?: string | null): Promise<boolean> {
  const planCode = parsePlanCode(sub.planCode);
  if (!sub.billingKey || !planCode) return false;
  const plan = PLANS[planCode];

  // 금액은 항상 서버의 PLANS에서 읽는다. 클라이언트가 금액을 보내는 입구를 아예 만들지
  // 않았으므로 "저장된 주문 금액과 대조" 자체가 필요 없다 — 대조할 클라이언트 값이 없다.
  const orderId = randomUUID();
  await prisma.payment.create({
    data: { userId: sub.userId, orderId, amount: plan.priceKrw, status: "pending" },
  });

  try {
    const payment = await chargeWithBillingKey({
      billingKey: sub.billingKey,
      customerKey: sub.customerKey,
      orderId,
      orderName: `AI 나들이 에이전트 ${plan.name} 플랜`,
      amount: plan.priceKrw,
      customerEmail,
    });

    const now = new Date();
    await prisma.$transaction([
      prisma.payment.update({
        where: { orderId },
        data: { status: "paid", paymentKey: payment.paymentKey, approvedAt: payment.approvedAt ? new Date(payment.approvedAt) : now },
      }),
      prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + PERIOD_DAYS * 24 * 60 * 60 * 1000),
        },
      }),
    ]);
    return true;
  } catch (err) {
    const message = err instanceof TossError ? `${err.code}: ${err.message}` : String(err);
    await prisma.$transaction([
      prisma.payment.update({ where: { orderId }, data: { status: "failed", failureMessage: message.slice(0, 500) } }),
      // 결제가 실패해도 구독 행은 남긴다 — 카드만 바꿔 끼우면 되는 상태이고,
      // 한도는 past_due 동안 무료 티어로 떨어진다(서비스를 아예 막지는 않는다).
      prisma.subscription.update({ where: { id: sub.id }, data: { status: "past_due" } }),
    ]);
    console.error("구독 승인 실패:", message);
    return false;
  }
}
