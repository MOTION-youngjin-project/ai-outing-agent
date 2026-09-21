import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { parsePlanCode } from "@/lib/billing/plans";

export const runtime = "nodejs";

// 관리자가 구독을 수동으로 지급/해지한다. 그랜트는 billingKey를 건드리지 않는다 —
// 이미 카드가 등록된 유료 사용자에게 보너스 기간을 얹어줄 때 카드를 지우면 안 되고,
// 카드 없는 사용자에게는 애초에 만들 값이 없다(quota.ts 갱신은 billingKey가 있을 때만
// 청구를 시도하므로 없어도 기간 동안은 정상적으로 그 플랜 한도를 받는다).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const { id } = await params;
  let userId: bigint;
  try {
    userId = BigInt(id);
  } catch {
    return NextResponse.json({ error: "잘못된 사용자 id입니다." }, { status: 400 });
  }

  const form = await request.formData();
  const action = form.get("action");

  if (action === "cancel") {
    await prisma.subscription.updateMany({ where: { userId }, data: { status: "canceled" } });
  } else if (action === "grant") {
    const planCode = parsePlanCode(form.get("planCode"));
    const days = Math.max(1, Math.trunc(Number(form.get("days"))) || 30);
    if (!planCode) return NextResponse.json({ error: "잘못된 플랜입니다." }, { status: 400 });

    const now = new Date();
    const currentPeriodEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    await prisma.subscription.upsert({
      where: { userId },
      create: { userId, planCode, status: "active", customerKey: randomUUID(), currentPeriodStart: now, currentPeriodEnd },
      update: { planCode, status: "active", currentPeriodStart: now, currentPeriodEnd },
    });
  } else {
    return NextResponse.json({ error: "알 수 없는 동작입니다." }, { status: 400 });
  }

  return NextResponse.redirect(new URL(`/admin/users/${id}`, request.url));
}
