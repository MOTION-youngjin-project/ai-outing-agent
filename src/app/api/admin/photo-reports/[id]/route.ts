import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { absoluteUrlFromRequest, isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 신고 큐 처리 — 숨기면 그 사진을 hiddenAt으로 감추고, 무시하면 신고만 큐에서 뺀다.
// 둘 다 resolvedAt을 찍어 큐에서 사라지게 하는 건 같다(같은 사진의 다른 신고 행들도
// 함께 처리 — 숨긴 사진에 대해 남은 신고가 큐에 계속 떠 있을 이유가 없다).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const { id } = await params;
  let reportId: bigint;
  try {
    reportId = BigInt(id);
  } catch {
    return NextResponse.json({ error: "잘못된 신고 id입니다." }, { status: 400 });
  }

  const report = await prisma.placeImageReport.findUnique({ where: { id: reportId } });
  if (!report) return NextResponse.redirect(absoluteUrlFromRequest(request, "/admin/photo-reports"));

  const form = await request.formData();
  const action = form.get("action");

  if (action === "hide") {
    await prisma.placeImage.update({ where: { id: report.placeImageId }, data: { hiddenAt: new Date() } });
  } else if (action !== "dismiss") {
    return NextResponse.json({ error: "알 수 없는 동작입니다." }, { status: 400 });
  }
  await prisma.placeImageReport.updateMany({
    where: { placeImageId: report.placeImageId, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });

  return NextResponse.redirect(absoluteUrlFromRequest(request, "/admin/photo-reports"));
}
