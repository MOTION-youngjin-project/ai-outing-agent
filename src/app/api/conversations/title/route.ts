import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { summarizeConversationTitle } from "@/lib/agent";

export const runtime = "nodejs";

// 대화의 첫 턴 응답을 받은 직후 클라이언트가 한 번 호출한다(사이드바 "대화 기록" 제목용).
// 보조 기능이라 실패해도 조용히 빈 값 — 사이드바는 그러면 userQuery로 대체해서 보여준다.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const agentRunId = body?.agentRunId;
  if (typeof agentRunId !== "string") {
    return NextResponse.json({ error: "agentRunId가 필요합니다." }, { status: 400 });
  }

  try {
    // title이 이미 있으면(재호출·경쟁 요청) 다시 만들지 않는다 — 멱등.
    const run = await prisma.agentRun.findFirst({
      where: { id: agentRunId, userId: BigInt(session.user.id), title: null },
      select: { userQuery: true },
    });
    if (!run?.userQuery) return NextResponse.json({ title: "" });

    const title = await summarizeConversationTitle(run.userQuery);
    if (!title) return NextResponse.json({ title: "" });

    await prisma.agentRun.update({ where: { id: agentRunId }, data: { title } });
    return NextResponse.json({ title });
  } catch {
    return NextResponse.json({ title: "" });
  }
}
