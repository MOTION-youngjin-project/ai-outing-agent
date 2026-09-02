import { prisma } from "@/lib/prisma";
import { normalizeSido } from "@/lib/region";
import { runAgent, type ChatTurn, type Recommendation } from "@/lib/agent";
import { getCachedWeather } from "./weather";
import { getCachedAirQuality } from "./airQuality";
import { resolvePlaceByName } from "./places";
import { findOrCreateSidoRegion } from "./shared";
import type { Place } from "../../../generated/prisma/client";

export interface RecommendationRunResult {
  recommendation: Recommendation;
  agentRunId: string;
  recommendationRouteId: string | null;
}

// ponytail: "이 추천이 유효하다고 볼 기간" — 24시간으로 잡음, 조정 가능.
const AGENT_RUN_TTL_MS = 24 * 60 * 60 * 1000;

// 작업 순서표 13번. 기존 runAgent(LLM)의 결과는 그대로 쓰고(agent.ts는 안 건드림),
// 그 결과를 agent_runs/recommendation_routes/route_places에 기록만 새로 붙인다.
export async function createRecommendationRun(history: ChatTurn[]): Promise<RecommendationRunResult> {
  const regionName = normalizeSido(history.map((h) => h.content).join(" "));
  const region = regionName ? await findOrCreateSidoRegion(regionName) : null;

  let recommendation: Recommendation;
  try {
    recommendation = await runAgent(history);
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
  // 보장 못 해서(동명이인 장소) 못 찾은 곳은 verificationRequired로 표시해두고 건너뛴다.
  const resolvedPlaces: { place: Place | null; reason: string }[] = [];
  for (const p of recommendation.places) {
    // 카카오 API가 실패해도(네트워크/쿼터) 이미 나온 LLM 추천 자체는 살려야 한다 —
    // 이 장소 하나만 못 찾은 것으로 취급하고 전체 요청을 실패시키지 않는다.
    let place: Place | null = null;
    try {
      place = await resolvePlaceByName(p.name, regionName);
    } catch (err) {
      console.error(`장소 매칭 실패(${p.name}):`, err);
    }
    resolvedPlaces.push({ place, reason: p.reason });
  }
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
      // ponytail: agent.ts가 실내/야외를 구조화된 필드로 안 주고 텍스트에만 녹여서 답해서
      // 기본값 mixed로 둠 — RecommendationSchema에 필드가 추가되면 그대로 연결.
      environmentMode: "mixed",
      currentAirQualityId: airQuality ? BigInt(airQuality.id) : undefined,
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
