import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const RECENT_LIMIT = 5;

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
      take: RECENT_LIMIT,
      select: { id: true, userQuery: true, startedAt: true },
    }),
    prisma.agentRun.count({ where }),
  ]);

  const data = runs.map((r) => ({ id: r.id, question: r.userQuery, askedAt: r.startedAt.toISOString() }));
  return NextResponse.json({ data, totalCount });
}
