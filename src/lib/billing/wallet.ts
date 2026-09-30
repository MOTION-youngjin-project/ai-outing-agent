import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { TOPUP_AMOUNT_KRW } from "./plans";
import { chargeWithBillingKey, TossError } from "./toss";
import type { Wallet } from "../../../generated/prisma/client";

// 충전 1회. 최초 카드 등록 직후의 첫 충전과, 크레딧이 모자랄 때의 자동충전이
// **같은 함수**를 탄다 — 돈이 나가는 경로가 둘이면 한쪽만 고치는 실수가 난다.
//
// 순서가 중요하다: Payment 행을 pending으로 **먼저** 만들고 그 orderId를 멱등키로
// 쓴다. 승인 요청을 보내고 응답을 못 받는 경우가 실제로 있는데, 행을 나중에
// 만들면 그때 무슨 요청이 나갔는지 알 방법이 없다.
export async function topUpWallet(wallet: Wallet, customerEmail?: string | null): Promise<boolean> {
  if (!wallet.billingKey) return false;

  const orderId = randomUUID();
  await prisma.payment.create({
    data: { userId: wallet.userId, orderId, amount: TOPUP_AMOUNT_KRW, status: "pending" },
  });

  try {
    const payment = await chargeWithBillingKey({
      billingKey: wallet.billingKey,
      customerKey: wallet.customerKey,
      orderId,
      orderName: "나들플랜 크레딧 충전",
      amount: TOPUP_AMOUNT_KRW,
      customerEmail,
    });

    await prisma.$transaction([
      prisma.payment.update({
        where: { orderId },
        data: { status: "paid", paymentKey: payment.paymentKey, approvedAt: payment.approvedAt ? new Date(payment.approvedAt) : new Date() },
      }),
      prisma.wallet.update({ where: { id: wallet.id }, data: { balanceKrw: { increment: TOPUP_AMOUNT_KRW } } }),
    ]);
    return true;
  } catch (err) {
    const message = err instanceof TossError ? `${err.code}: ${err.message}` : String(err);
    await prisma.payment.update({ where: { orderId }, data: { status: "failed", failureMessage: message.slice(0, 500) } });
    console.error("크레딧 충전 실패:", message);
    return false;
  }
}
