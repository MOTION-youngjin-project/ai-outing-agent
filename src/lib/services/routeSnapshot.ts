import { prisma } from "@/lib/prisma";
import type { RecommendResult, PlaceWithMeta } from "@/lib/clientApi";

// agentRunId로 그때 저장해둔 route_places.enriched_snapshot을 모아 postRecommend()가 처음
// 돌려주는 것과 같은 모양(RecommendResult)으로 되살린다. 새로고침 복원(/api/recommend/[runId])과
// 코스 저장(스냅샷 생성) 둘 다 정확히 같은 값을 써야 해서 한 곳에 둔다.
export async function loadRouteSnapshot(runId: string): Promise<RecommendResult | null> {
  const route = await prisma.recommendationRoute.findFirst({
    where: { agentRunId: runId, rankNo: 1 },
    include: { routePlaces: { orderBy: { sequenceNo: "asc" } } },
  });
  if (!route) return null;

  return {
    needsMoreInfo: false,
    message: route.recommendationReason,
    agentRunId: runId,
    places: route.routePlaces
      .map((rp) => rp.enrichedSnapshot as PlaceWithMeta | null)
      .filter((p): p is PlaceWithMeta => p !== null),
  };
}
