import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { RecommendResult } from "@/lib/clientApi";

export const runtime = "nodejs";

// "코스 다시 보기" — 저장 시점 스냅샷을 그대로 돌려준다(추천 런이 이미 정리됐어도 열린다).
export async function GET(_request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { publicId } = await params;
  const course = await prisma.savedCourse.findFirst({
    where: { publicId, userId: BigInt(session.user.id) },
  });

  if (!course) {
    return NextResponse.json({ error: "저장한 코스를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      publicId: course.publicId,
      title: course.title,
      savedAt: course.createdAt.toISOString(),
      course: course.snapshot as unknown as RecommendResult,
    },
  });
}
