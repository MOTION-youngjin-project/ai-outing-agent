import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const expiredRuns = await prisma.agentRun.findMany({
  where: { expiresAt: { lt: new Date() } },
  select: { id: true, recommendationRoutes: { select: { id: true } } },
});
const runIds = expiredRuns.map((run) => run.id);
const routeIds = expiredRuns.flatMap((run) => run.recommendationRoutes.map((route) => route.id));

const deleted = await prisma.$transaction(async (tx) => {
  const ragRetrievals = await tx.ragRetrieval.deleteMany({ where: { toolCall: { agentRunId: { in: runIds } } } });
  const parkingRecommendations = await tx.routeParkingRecommendation.deleteMany({ where: { routeId: { in: routeIds } } });
  const routePlaces = await tx.routePlace.deleteMany({ where: { routeId: { in: routeIds } } });
  const routes = await tx.recommendationRoute.deleteMany({ where: { agentRunId: { in: runIds } } });
  const toolCalls = await tx.toolCall.deleteMany({ where: { agentRunId: { in: runIds } } });
  const ingestionEvents = await tx.placeIngestionEvent.deleteMany({ where: { agentRunId: { in: runIds } } });
  const runs = await tx.agentRun.deleteMany({ where: { id: { in: runIds } } });
  return {
    runs: runs.count,
    routes: routes.count,
    routePlaces: routePlaces.count,
    parkingRecommendations: parkingRecommendations.count,
    toolCalls: toolCalls.count,
    ragRetrievals: ragRetrievals.count,
    ingestionEvents: ingestionEvents.count,
  };
});

console.log("만료 데이터 정리 완료", deleted);
await prisma.$disconnect();
