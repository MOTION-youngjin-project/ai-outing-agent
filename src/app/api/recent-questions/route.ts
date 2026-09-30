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

  // [2026-09-21] expiresAt(생성 + 24시간) 필터를 뺐다.
  // 그 값은 "이 추천 결과를 아직 유효하다고 볼 기간"을 표시하려고 둔 것인데, 여기에
  // 걸어두면 하루만 지나도 대화가 사이드바에서 통째로 사라진다 — 행은 DB에 그대로
  // 남아 있고 마이페이지에서도 보이는데 채팅 기록 창에서만 없어져서, 기록이 지워진
  // 것처럼 보였다(사용자 신고: 지난주 같은 계정 대화가 안 뜸).
  // 대화 목록은 "지난 일의 기록"이지 "유효기간 있는 결과"가 아니라서 시간으로 거르지
  // 않는다. 개수는 아래 RECENT_LIMIT으로 이미 제한된다.
  const where = { userId: BigInt(session.user.id), userQuery: { not: null } } as const;
  const [runs, totalCount] = await Promise.all([
    prisma.agentRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: SCAN_LIMIT,
      select: { id: true, conversationId: true, userQuery: true, title: true, startedAt: true, pinnedAt: true },
    }),
    prisma.agentRun.count({ where }),
  ]);

  // conversationId 도입 전 turn(null)은 자기 자신의 id를 그룹 키로 취급한다 — 같은
  // 대화의 여러 turn을 사이드바 한 항목으로 묶는다. 라벨은 AI가 요약한 title이 있으면
  // 그걸 쓰고(대화의 첫 턴에서만 채워짐), 아직 없으면(요약 실패·구버전 대화) 첫 질문
  // 원문으로 대체한다.
  const groups = new Map<string, { id: string; question: string; title: string | null; latestAt: Date; pinned: boolean }>();
  for (const run of runs) {
    const key = run.conversationId ?? run.id;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { id: key, question: run.userQuery!, title: run.title, latestAt: run.startedAt, pinned: !!run.pinnedAt });
    } else {
      // runs가 최신순이라 뒤로 갈수록 더 이전 turn이다 — 계속 덮어써서 결국 가장 오래된
      // (그 대화의 첫) 질문·제목이 라벨로 남는다.
      existing.question = run.userQuery!;
      if (run.title) existing.title = run.title;
      if (run.pinnedAt) existing.pinned = true;
    }
  }

  const data = [...groups.values()]
    // 고정한 대화는 RECENT_LIMIT에 밀려 잘리지 않게 먼저 세운다.
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.latestAt.getTime() - a.latestAt.getTime())
    .slice(0, RECENT_LIMIT)
    .map((g) => ({ id: g.id, question: g.title ?? g.question, askedAt: g.latestAt.toISOString(), pinned: g.pinned }));

  return NextResponse.json({ data, totalCount });
}
