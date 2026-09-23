import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { RecommendResult } from "@/lib/clientApi";

export const runtime = "nodejs";

// 사이드바 "대화 기록"에서 과거 대화를 열어 홈 화면(채팅)으로 이어서 보낼 때 쓴다.
// 단일 결과(/api/recommend/[runId])는 링크만 알면 누구나 볼 수 있는 공유 정책이지만,
// 대화 전체는 여러 turn의 원문 질문이 다 보이는 만큼 로그인 계정 소유자만 조회 가능하다.
export async function GET(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const runs = await prisma.agentRun.findMany({
    where: {
      userId: BigInt(session.user.id),
      userQuery: { not: null },
      // expiresAt 필터 없음 — 사이드바 목록(recent-questions)과 짝을 맞춘다.
      // 목록에는 뜨는데 누르면 "만료되었습니다"가 나오면 더 나쁘다.
      status: { in: ["completed", "partial"] },
      // conversationId 도입 전 대화는 행 자체가 하나뿐이고, 그 행의 id를 그룹 키로 썼다
      // (recent-questions와 동일한 규칙) — 그래서 conversationId가 null이면서 id가
      // 일치하는 단일 행도 같이 찾는다.
      OR: [{ conversationId }, { conversationId: null, id: conversationId }],
    },
    orderBy: { startedAt: "asc" },
    take: 50,
    select: { id: true, conversationId: true, userQuery: true, recommendationJson: true, currentRegionId: true },
  });

  if (runs.length === 0) {
    return NextResponse.json({ error: "대화를 찾을 수 없습니다." }, { status: 404 });
  }

  const turns = runs
    .filter((r) => r.recommendationJson)
    .map((r) => ({
      agentRunId: r.id,
      userQuery: r.userQuery!,
      recommendation: { ...(r.recommendationJson as unknown as RecommendResult), agentRunId: r.id },
    }));

  return NextResponse.json({
    data: {
      // 실제 conversationId가 있으면 그 값을, 없으면(레거시 단일 행) 그 행의 id를 그대로
      // 써서 이후 turn들이 여기 이어 붙게 한다.
      conversationId: runs[0].conversationId ?? runs[0].id,
      regionId: runs[0].currentRegionId?.toString() ?? null,
      turns,
    },
  });
}
