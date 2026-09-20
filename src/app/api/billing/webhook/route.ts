import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchPaymentByOrderId } from "@/lib/billing/toss";
import { PERIOD_DAYS } from "@/lib/billing/plans";

export const runtime = "nodejs";

// 결제 상태 동기화. 클라이언트 리다이렉트만 믿으면 사용자가 창을 닫은 경우를 놓친다.
//
// **본문을 신뢰하지 않는다.** 이 엔드포인트는 누구나 POST할 수 있으므로, 본문에서는
// orderId만 힌트로 꺼내고 실제 상태는 우리 시크릿 키로 토스에 직접 물어본다. 서명 검증
// 코드를 따로 짜지 않고도 신뢰 경계가 닫힌다(그리고 서명 스펙이 바뀌어도 안 깨진다).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const orderId = typeof body?.data?.orderId === "string" ? body.data.orderId : typeof body?.orderId === "string" ? body.orderId : null;
  // 재전송을 유발하지 않도록 200으로 받아넘긴다 — 우리가 모르는 orderId는 할 일이 없다.
  if (!orderId) return NextResponse.json({ ok: true });

  const payment = await prisma.payment.findUnique({ where: { orderId } });
  if (!payment) return NextResponse.json({ ok: true });

  try {
    const remote = await fetchPaymentByOrderId(orderId);
    const paid = remote.status === "DONE";
    // 금액까지 확인한다 — 우리가 청구한 금액과 다르면 우리 주문이 아니거나 뭔가 잘못된
    // 것이므로 활성화하지 않는다.
    const amountMatches = remote.totalAmount === payment.amount;

    await prisma.payment.update({
      where: { orderId },
      data: {
        status: paid && amountMatches ? "paid" : "failed",
        paymentKey: remote.paymentKey,
        approvedAt: remote.approvedAt ? new Date(remote.approvedAt) : null,
        failureMessage: paid && amountMatches ? null : `webhook status=${remote.status} amount=${remote.totalAmount}`,
      },
    });

    // 승인 호출 응답을 못 받아 pending으로 남아 있던 건을 웹훅이 되살리는 경우 —
    // 이때 구독 기간도 같이 굴려준다(chargeSubscription이 못 한 뒷정리).
    if (paid && amountMatches) {
      const sub = await prisma.subscription.findUnique({ where: { userId: payment.userId } });
      if (sub && sub.status !== "active") {
        const start = remote.approvedAt ? new Date(remote.approvedAt) : new Date();
        await prisma.subscription.update({
          where: { id: sub.id },
          data: {
            status: "active",
            currentPeriodStart: start,
            currentPeriodEnd: new Date(start.getTime() + PERIOD_DAYS * 24 * 60 * 60 * 1000),
          },
        });
      }
    }
  } catch (err) {
    console.error("결제 웹훅 동기화 실패:", err);
  }

  return NextResponse.json({ ok: true });
}
