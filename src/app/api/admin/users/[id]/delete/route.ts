import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 계정 삭제 안내 페이지(account-deletion)가 약속한 "이메일로 요청하면 삭제" 절차의
// 실제 실행부. User를 지우면 스키마의 onDelete: Cascade로 저장 장소/코스/대화 기록
// (agent_runs)/구독/결제까지 한 번에 정리된다 — 그 안내 페이지가 나열한 삭제 대상과 일치.
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

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return NextResponse.redirect(new URL("/admin", request.url));

  // 관리자 계정을 실수로(또는 다른 관리자가) 지워서 관리자 로그인이 막히는 걸 막는다.
  if (isAdminEmail(user.email)) {
    return NextResponse.redirect(new URL(`/admin/users/${id}?error=confirm_mismatch`, request.url));
  }

  const form = await request.formData();
  const confirmEmail = String(form.get("confirmEmail") ?? "").trim().toLowerCase();
  if (confirmEmail !== user.email.toLowerCase()) {
    return NextResponse.redirect(new URL(`/admin/users/${id}?error=confirm_mismatch`, request.url));
  }

  await prisma.user.delete({ where: { id: userId } });
  return NextResponse.redirect(new URL("/admin?deleted=1", request.url));
}
