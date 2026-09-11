import { prisma } from "@/lib/prisma";
import { ownerWhere } from "@/lib/recommendation-owner";
import type { RecommendResult, PlaceWithMeta } from "@/lib/clientApi";

export async function readRecommendation(id: string, userId?: string | null, sessionKeyHash?: string | null): Promise<RecommendResult | null> {
  if (!userId && !sessionKeyHash) return null;
  const run = await prisma.agentRun.findFirst({
    where: { AND: [{ id }, ownerWhere(userId, sessionKeyHash)], expiresAt: { gt: new Date() }, status: { in: ["completed", "partial"] } },
    include: { recommendationRoutes: { where: { rankNo: 1 }, include: { routePlaces: { orderBy: { sequenceNo: "asc" } } } } },
  });
  if (!run) return null;
  if (run.recommendationJson) return { ...run.recommendationJson as unknown as RecommendResult, agentRunId: id };
  const route = run.recommendationRoutes[0];
  if (!route) return null;
  return { needsMoreInfo: false, message: route.recommendationReason, agentRunId: id,
    places: route.routePlaces.map(p => p.enrichedSnapshot as PlaceWithMeta | null).filter((p): p is PlaceWithMeta => p !== null) };
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
