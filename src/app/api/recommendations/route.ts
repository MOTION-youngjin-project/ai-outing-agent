import { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const RUN_STATUSES = ["pending", "running", "completed", "partial", "failed"] as const;

export async function GET(req: NextRequest) {
  const limitValue = req.nextUrl.searchParams.get("limit") ?? "20";
  const status = req.nextUrl.searchParams.get("status");
  const limit = Number(limitValue);

  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return apiError(400, "INVALID_LIMIT", "limit은 1~50 사이의 정수여야 합니다.");
  }
  if (status && !RUN_STATUSES.includes(status as (typeof RUN_STATUSES)[number])) {
    return apiError(400, "INVALID_STATUS", "지원하지 않는 실행 상태입니다.");
  }

  const runs = await prisma.agentRun.findMany({
    where: status ? { status: status as (typeof RUN_STATUSES)[number] } : undefined,
    orderBy: { startedAt: "desc" },
    take: limit,
    include: {
      currentRegion: { select: { id: true, name: true, level: true } },
      recommendationRoutes: { select: { id: true, rankNo: true, title: true, environmentMode: true } },
    },
  });

  return Response.json({
    count: runs.length,
    data: runs.map((run) => ({
      ...run,
      currentRegionId: run.currentRegionId?.toString() ?? null,
      currentRegion: run.currentRegion
        ? { ...run.currentRegion, id: run.currentRegion.id.toString() }
        : null,
      recommendationRoutes: run.recommendationRoutes.map((route) => ({
        ...route,
        id: route.id.toString(),
      })),
    })),
  });
}
