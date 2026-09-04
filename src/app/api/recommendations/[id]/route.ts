import { apiError, jsonSafe } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: RouteContext<"/api/recommendations/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_PATTERN.test(id)) return apiError(400, "INVALID_RUN_ID", "올바른 실행 ID가 아닙니다.");

  const run = await prisma.agentRun.findUnique({
    where: { id },
    include: {
      currentRegion: { select: { id: true, name: true, level: true } },
      recommendationRoutes: {
        orderBy: { rankNo: "asc" },
        include: {
          routePlaces: {
            orderBy: { sequenceNo: "asc" },
            include: { place: true },
          },
          parkingRecommendations: { include: { parkingLot: true } },
        },
      },
    },
  });
  if (!run) return apiError(404, "RUN_NOT_FOUND", "추천 실행 기록을 찾을 수 없습니다.");

  return Response.json({ data: jsonSafe(run) });
}
