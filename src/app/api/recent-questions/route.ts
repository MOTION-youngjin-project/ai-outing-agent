import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const RECENT_LIMIT = 5;
// 최신 대화 5개를 찾기 위해 넉넉히 훑는 원본 행(turn) 개수 — 사이드바 하나 그리는
// 가벼운 조회라 이 정도 스캔 폭이면 충분하다.
const SCAN_LIMIT = 100;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const where = { userId: BigInt(session.user.id), userQuery: { not: null }, expiresAt: { gt: new Date() } } as const;
  const [runs, totalCount] = await Promise.all([
    prisma.agentRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: SCAN_LIMIT,
      select: { id: true, conversationId: true, userQuery: true, startedAt: true },
    }),
    prisma.agentRun.count({ where }),
  ]);

  // conversationId 도입 전 turn(null)은 자기 자신의 id를 그룹 키로 취급한다 — 같은
  // 대화의 여러 turn을 사이드바 한 항목으로 묶고, 라벨은 그 대화의 첫 질문으로 쓴다.
  const groups = new Map<string, { id: string; question: string; latestAt: Date }>();
  for (const run of runs) {
    const key = run.conversationId ?? run.id;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { id: key, question: run.userQuery!, latestAt: run.startedAt });
    } else {
      // runs가 최신순이라 뒤로 갈수록 더 이전 turn이다 — 계속 덮어써서 결국 가장 오래된
      // (그 대화의 첫) 질문이 라벨로 남는다.
      existing.question = run.userQuery!;
    }
  }

  const data = [...groups.values()]
    .sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime())
    .slice(0, RECENT_LIMIT)
    .map((g) => ({ id: g.id, question: g.question, askedAt: g.latestAt.toISOString() }));

  return NextResponse.json({ data, totalCount });
}
