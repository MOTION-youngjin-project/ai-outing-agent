import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { absoluteUrlFromRequest, isAdminEmail, logAdminAction } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 관리자가 광고 질문권을 수동으로 지급하거나 오늘 무료 사용을 초기화한다. 결제(billing/*)
// 대신 ads/quota.ts가 추천 게이트를 맡는 지금 체계에서 실제로 쓰이는 지원 액션이다.
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
  if (!target) return NextResponse.redirect(absoluteUrlFromRequest(request, "/admin"));

  const form = await request.formData();
  const action = form.get("action");

  if (action === "reset_free") {
    await prisma.adCredit.updateMany({ where: { userId }, data: { lastFreeAt: null } });
    await logAdminAction({ adminEmail: adminEmail!, action: "reset_daily_free", targetUserId: userId, targetEmail: target.email });
  } else if (action === "grant") {
    const credits = Math.max(1, Math.trunc(Number(form.get("credits"))) || 0);
    if (!credits) return NextResponse.json({ error: "잘못된 개수입니다." }, { status: 400 });

    await prisma.adCredit.upsert({
      where: { userId },
      create: { userId, credits },
      update: { credits: { increment: credits } },
    });
    await logAdminAction({
      adminEmail: adminEmail!,
      action: "grant_ad_credit",
      targetUserId: userId,
      targetEmail: target.email,
      detail: { credits },
    });
  } else {
    return NextResponse.json({ error: "알 수 없는 동작입니다." }, { status: 400 });
  }

  return NextResponse.redirect(absoluteUrlFromRequest(request, `/admin/users/${id}`));
}
