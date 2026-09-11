import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadRouteSnapshot } from "@/lib/services/routeSnapshot";
import type { RecommendResult } from "@/lib/clientApi";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const courses = await prisma.savedCourse.findMany({
    where: { userId: BigInt(session.user.id) },
    orderBy: { createdAt: "desc" },
  });

  const data = courses.map((c) => ({
    publicId: c.publicId,
    title: c.title,
    savedAt: c.createdAt.toISOString(),
    course: c.snapshot as unknown as RecommendResult,
  }));

  return NextResponse.json({ data });
}

// 저장은 runId만 받고 코스 내용은 서버가 DB에서 직접 만든다 — 클라이언트가 보낸 JSON을
// 그대로 저장하지 않는다. 제목도 그 런의 질문 원문(user_query)에서 가져온다.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { runId } = await request.json();
  if (typeof runId !== "string" || !runId) {
    return NextResponse.json({ error: "runId가 필요합니다." }, { status: 400 });
  }

  const snapshot = await loadRouteSnapshot(runId);
  if (!snapshot || (snapshot.places?.length ?? 0) === 0) {
    return NextResponse.json({ error: "저장할 코스를 찾을 수 없습니다." }, { status: 404 });
  }

  const run = await prisma.agentRun.findUnique({ where: { id: runId }, select: { userQuery: true } });
  const title = (run?.userQuery ?? "").trim().slice(0, 250) || "나들이 코스";

  // 같은 코스를 다시 저장해도 새 행을 만들지 않는다(버튼 두 번 눌러도 안전).
  const saved = await prisma.savedCourse.upsert({
    where: { userId_agentRunId: { userId: BigInt(session.user.id), agentRunId: runId } },
    create: {
      userId: BigInt(session.user.id),
      agentRunId: runId,
      title,
      snapshot: snapshot as unknown as object,
    },
    update: {},
  });

  return NextResponse.json({ data: { publicId: saved.publicId } });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const publicId = request.nextUrl.searchParams.get("publicId");
  if (!publicId) {
    return NextResponse.json({ error: "publicId가 필요합니다." }, { status: 400 });
  }

  // userId까지 조건에 넣어 남의 저장본을 지울 수 없게 한다(publicId만으로 삭제 금지).
  await prisma.savedCourse.deleteMany({
    where: { publicId, userId: BigInt(session.user.id) },
  });

  return NextResponse.json({ deleted: true });
}
