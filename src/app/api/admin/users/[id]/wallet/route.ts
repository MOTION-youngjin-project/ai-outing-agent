import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { isAdminEmail, logAdminAction } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 관리자가 지갑 크레딧을 수동으로 지급하거나 등록된 카드를 해제한다. 지급은 billingKey를
// 건드리지 않는다 — 이미 카드가 등록된 사용자에게 보너스 크레딧을 얹어줄 때 카드를
// 지우면 안 되고, 카드 없는 사용자는 무료 지급분을 다 쓰면 그냥 다시 0원으로 돌아간다
// (자동충전은 billingKey가 있을 때만 시도되므로 없어도 안전하다).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const adminEmail = session?.user?.email;
  if (!isAdminEmail(adminEmail)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const { id } = await params;
  let userId: bigint;
  try {
    userId = BigInt(id);
  } catch {
    return NextResponse.json({ error: "잘못된 사용자 id입니다." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!target) return NextResponse.redirect(new URL("/admin", request.url));

  const form = await request.formData();
  const action = form.get("action");

  if (action === "clear_billing_key") {
    await prisma.wallet.updateMany({ where: { userId }, data: { billingKey: null } });
    await logAdminAction({ adminEmail: adminEmail!, action: "clear_billing_key", targetUserId: userId, targetEmail: target.email });
  } else if (action === "grant") {
    const amountKrw = Math.max(1, Math.trunc(Number(form.get("amountKrw"))) || 0);
    if (!amountKrw) return NextResponse.json({ error: "잘못된 금액입니다." }, { status: 400 });

    await prisma.wallet.upsert({
      where: { userId },
      create: { userId, customerKey: randomUUID(), balanceKrw: amountKrw },
      update: { balanceKrw: { increment: amountKrw } },
    });
    await logAdminAction({
      adminEmail: adminEmail!,
      action: "grant_credit",
      targetUserId: userId,
      targetEmail: target.email,
      detail: { amountKrw },
    });
  } else {
    return NextResponse.json({ error: "알 수 없는 동작입니다." }, { status: 400 });
  }

  return NextResponse.redirect(new URL(`/admin/users/${id}`, request.url));
}
