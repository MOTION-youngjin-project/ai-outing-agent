import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail, logAdminAction } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 계정 삭제 안내 페이지(account-deletion)가 약속한 "이메일로 요청하면 삭제" 절차의
// 실제 실행부. User onDelete: Cascade가 저장 장소/코스/구독/결제/agent_runs는 지워주지만,
// agent_runs를 참조하는 tool_calls/recommendation_routes/route_places 등은 FK가
// RESTRICT라 cascade가 거기서 멈춘다(실제로 사용 이력 있는 계정 삭제 시 P2003으로 확인됨).
// deleteRecommendation(recommendation-history.ts)이 런 1건에 대해 쓰는 정리 순서를
// 그대로 유저 전체 런에 적용한다.
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

  await prisma.$transaction(async (tx) => {
    const runFilter = { agentRun: { userId } };
    await tx.routeParkingRecommendation.deleteMany({ where: { route: runFilter } });
    await tx.routePlace.deleteMany({ where: { route: runFilter } });
    await tx.recommendationRoute.deleteMany({ where: runFilter });
    await tx.ragRetrieval.deleteMany({ where: { toolCall: runFilter } });
    await tx.toolCall.deleteMany({ where: runFilter });
    await tx.placeIngestionEvent.updateMany({ where: runFilter, data: { agentRunId: null } });
    await tx.user.delete({ where: { id: userId } });
  });
  await logAdminAction({ adminEmail: adminEmail!, action: "delete_account", targetUserId: userId, targetEmail: user.email });
  return NextResponse.redirect(new URL("/admin?deleted=1", request.url));
}
