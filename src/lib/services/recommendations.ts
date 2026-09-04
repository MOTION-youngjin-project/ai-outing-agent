import { prisma } from "@/lib/prisma";
import { normalizeSido } from "@/lib/region";
import { runAgentStream, type AgentProgressEvent, type ChatTurn, type Recommendation } from "@/lib/agent";
import { getCachedWeather } from "./weather";
import { getCachedAirQuality } from "./airQuality";
import { resolvePlaceByName } from "./places";
import { findOrCreateSidoRegion } from "./shared";
import { inferEnvironmentMode } from "./matching";
import type { Place } from "../../../generated/prisma/client";

export interface RecommendationRunResult {
  recommendation: Recommendation;
  agentRunId: string;
  recommendationRouteId: string | null;
}

export type RecommendationProgressEvent = AgentProgressEvent | { type: "resolving_places" };

// ponytail: "이 추천이 유효하다고 볼 기간" — 24시간으로 잡음, 조정 가능.
const AGENT_RUN_TTL_MS = 24 * 60 * 60 * 1000;

// 작업 순서표 13번. 기존 runAgent(LLM)의 결과는 그대로 쓰고(agent.ts는 안 건드림),
// 그 결과를 agent_runs/recommendation_routes/route_places에 기록만 새로 붙인다.
export async function createRecommendationRun(
  history: ChatTurn[],
  onProgress?: (event: RecommendationProgressEvent) => void
): Promise<RecommendationRunResult> {
  const regionName = normalizeSido(history.map((h) => h.content).join(" "));
  const region = regionName ? await findOrCreateSidoRegion(regionName) : null;

  let recommendation: Recommendation;
  try {
    recommendation = await runAgentStream(history, onProgress);
  } catch (err) {
    await prisma.agentRun.create({
      data: {
        requestMode: "question",
        currentRegionId: region?.id,
        status: "failed",
        expiresAt: new Date(Date.now() + AGENT_RUN_TTL_MS),
        completedAt: new Date(),
        errorSummary: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      },
    });
    throw err;
  }

  if (recommendation.needsMoreInfo || !recommendation.places) {
    const agentRun = await prisma.agentRun.create({
      data: {
        requestMode: "question",
        currentRegionId: region?.id,
        status: "completed",
        routeCount: 0,
        expiresAt: new Date(Date.now() + AGENT_RUN_TTL_MS),
        completedAt: new Date(),
      },
    });
    return { recommendation, agentRunId: agentRun.id, recommendationRouteId: null };
  }

  const weather = regionName ? await getCachedWeather(regionName) : null;
  const airQuality = regionName ? await getCachedAirQuality(regionName) : null;

  // LLM이 이름만 준 장소를 카카오 검색으로 좌표 있는 Place와 매칭한다. 완벽한 매칭은
  // 보장 못 해서(동명이인 장소) 못 찾은 곳은 route_places에 기록 자체를 못 한다
  // (placeId가 필수 FK라 실제 Place 없이는 만들 수 없음) — 그런 곳이 있으면
  // agent_runs.status를 partial로 표시해서 "LLM은 N곳을 추천했지만 실제 저장된
  // route_places는 그보다 적을 수 있다"는 걸 나중에 알 수 있게 한다.
  onProgress?.({ type: "resolving_places" });
  // 장소마다 독립적인 카카오 검색이라 순차로 기다릴 이유가 없다 — 병렬로 처리.
  const resolvedPlaces = await Promise.all(
    recommendation.places.map(async (p) => {
      // 카카오 API가 실패해도(네트워크/쿼터) 이미 나온 LLM 추천 자체는 살려야 한다 —
      // 이 장소 하나만 못 찾은 것으로 취급하고 전체 요청을 실패시키지 않는다.
      let place: Place | null = null;
      try {
        place = await resolvePlaceByName(p.name, regionName);
      } catch (err) {
        console.error(`장소 매칭 실패(${p.name}):`, err);
      }
      return { place, reason: p.reason };
    })
  );
  const unresolvedCount = resolvedPlaces.filter((r) => !r.place).length;

  const agentRun = await prisma.agentRun.create({
    data: {
      requestMode: "question",
      currentRegionId: region?.id,
      status: unresolvedCount > 0 ? "partial" : "completed",
      routeCount: 1,
      dataUpdatedAt: new Date(),
      expiresAt: new Date(Date.now() + AGENT_RUN_TTL_MS),
      completedAt: new Date(),
    },
  });

  const route = await prisma.recommendationRoute.create({
    data: {
      agentRunId: agentRun.id,
      rankNo: 1,
      title: regionName ? `${regionName} 나들이 코스` : "나들이 코스",
      recommendationReason: recommendation.message,
      environmentMode: inferEnvironmentMode(recommendation),
      // 우리가 실제로 아는 건 "사용자가 나들이 가려는 지역"(목적지)의 대기질뿐이다 —
      // 사용자가 "지금 어디 있는지"는 입력받지 않으므로 currentAirQualityId는 채우지 않는다.
      // (그 기능이 생기면 여기에 별도 지역의 스냅샷을 조회해서 연결하면 됨.)
      destinationAirQualityId: airQuality ? BigInt(airQuality.id) : undefined,
      weatherSnapshotId: weather ? BigInt(weather.id) : undefined,
    },
  });

  let sequenceNo = 1;
  for (const { place, reason } of resolvedPlaces) {
    if (!place) continue;
    await prisma.routePlace.create({
      data: {
        routeId: route.id,
        sequenceNo: sequenceNo++,
        placeId: place.id,
        stopType: "visit",
        selectionReason: reason.slice(0, 1000),
        verificationRequired: false,
      },
    });
  }

  return { recommendation, agentRunId: agentRun.id, recommendationRouteId: route.id.toString() };
}
