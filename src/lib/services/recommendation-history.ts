import { prisma } from "@/lib/prisma";
import { loadRouteSnapshot } from "@/lib/services/routeSnapshot";
import type { RecommendResult } from "@/lib/clientApi";

// 소유자가 아니어도 결과는 돌려준다(읽기 전용). runId는 추측 불가능한 UUID이고 24시간 뒤
// 만료되므로 "링크를 받은 사람만 본다"가 성립한다 — 대신 isOwner로 소유자 전용 동작을 가른다.
export async function readRecommendation(
  id: string,
  userId?: string | null,
  sessionKeyHash?: string | null
): Promise<(RecommendResult & { isOwner: boolean }) | null> {
  const run = await prisma.agentRun.findFirst({
    where: { id, expiresAt: { gt: new Date() }, status: { in: ["completed", "partial"] } },
    select: { userId: true, sessionKeyHash: true, recommendationJson: true },
  });
  if (!run) return null;

  const isOwner =
    userId && /^\d+$/.test(userId)
      ? run.userId === BigInt(userId)
      : !!sessionKeyHash && run.userId === null && run.sessionKeyHash === sessionKeyHash;

  // 에이전트가 돌려준 원본(recommendationJson)이 있으면 그걸 쓰고, 없으면 route_places
  // 스냅샷에서 되살린다 — 저장 화면(saved_courses)과 정확히 같은 값을 쓰도록 한 곳에 모아둔 함수.
  const data = run.recommendationJson
    ? { ...(run.recommendationJson as unknown as RecommendResult), agentRunId: id }
    : await loadRouteSnapshot(id);
  if (!data) return null;

  return { ...data, isOwner };
}

export async function listRecommendations(userId: string) {
  const runs = await prisma.agentRun.findMany({
    where: { userId: BigInt(userId), expiresAt: { gt: new Date() }, status: { in: ["completed", "partial"] }, routeCount: { gt: 0 } },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }], take: 50,
    select: { id: true, userQuery: true, startedAt: true, expiresAt: true },
  });
  return runs.map(run => ({ id: run.id, question: run.userQuery ?? "나들이 추천", createdAt: run.startedAt.toISOString(), expiresAt: run.expiresAt.toISOString() }));
}

export async function deleteRecommendation(id: string, userId: string) {
  return prisma.$transaction(async tx => {
    const run = await tx.agentRun.findFirst({ where: { id, userId: BigInt(userId) }, select: { id: true } });
    if (!run) return false;
    const routeFilter = { route: { agentRunId: id } };
    await tx.routeParkingRecommendation.deleteMany({ where: routeFilter });
    await tx.routePlace.deleteMany({ where: routeFilter });
    await tx.recommendationRoute.deleteMany({ where: { agentRunId: id } });
    await tx.ragRetrieval.deleteMany({ where: { toolCall: { agentRunId: id } } });
    await tx.toolCall.deleteMany({ where: { agentRunId: id } });
    await tx.placeIngestionEvent.updateMany({ where: { agentRunId: id }, data: { agentRunId: null } });
    await tx.agentRun.delete({ where: { id } });
    return true;
  });
}
