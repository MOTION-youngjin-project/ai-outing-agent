import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { normalizeSido } from "@/lib/region";
import { runAgentStream, type AgentProgressEvent, type ChatTurn, type Recommendation } from "@/lib/agent";
import { getCachedWeather } from "./weather";
import { getCachedAirQuality } from "./airQuality";
import { resolvePlaceByName } from "./places";
import { findOrCreateSidoRegion } from "./shared";
import { inferEnvironmentMode, extractCategoryLabel, computeDistanceKm } from "./matching";
import type { Place } from "../../../generated/prisma/client";

export type GeoPoint = { latitude: number; longitude: number };

export type EnrichedPlace = NonNullable<Recommendation["places"]>[number] & {
  category: string | null;
  distanceKm: number | null;
  // 찜하기(SavedPlace) 저장/삭제 시 실제 DB Place를 가리키는 데 쓴다. 카카오 검색으로
  // 못 찾은 장소는 null — 저장 버튼을 비활성화해야 한다(가리킬 실제 장소가 없음).
  placeId: string | null;
  // 상세 화면의 미니 지도용. 장소 매칭에 이미 쓰는 좌표를 그대로 재사용(카카오 검색으로
  // 못 찾은 장소는 null).
  latitude: number | null;
  longitude: number | null;
};
export type EnrichedRecommendation = Omit<Recommendation, "places"> & { places?: EnrichedPlace[] };

export interface RecommendationRunResult {
  recommendation: EnrichedRecommendation;
  agentRunId: string;
  recommendationRouteId: string | null;
}

export type RecommendationProgressEvent = AgentProgressEvent | { type: "resolving_places" };

// ponytail: "이 추천이 유효하다고 볼 기간" — 24시간으로 잡음, 조정 가능.
const AGENT_RUN_TTL_MS = 24 * 60 * 60 * 1000;

// 작업 순서표 13번. 기존 runAgent(LLM)의 결과는 그대로 쓰고, 그 결과를
// agent_runs/recommendation_routes/route_places에 기록만 새로 붙인다.
// 거리(km)/카테고리 배지는 LLM에게 맡기지 않고(지어낼 위험), 장소 매칭에 이미 쓰는
// 카카오 좌표/카테고리 데이터로 여기서 직접 계산해 각 place에 붙여 내려보낸다.
export async function createRecommendationRun(
  history: ChatTurn[],
  onProgress?: (event: RecommendationProgressEvent) => void,
  origin?: GeoPoint | null,
  userId?: string | null
): Promise<RecommendationRunResult> {
  const regionName = normalizeSido(history.map((h) => h.content).join(" "));
  const region = regionName ? await findOrCreateSidoRegion(regionName) : null;
  // 마이페이지 "최근 질문"에 그대로 보여줄 사용자 원문 — history의 마지막 turn이
  // 이번 요청에서 사용자가 실제로 입력한 문장이다(이전 turn은 이미 지난 질문).
  const userQuery = history.at(-1)?.content?.slice(0, 1000);
  const userIdBigInt = userId ? BigInt(userId) : undefined;

  let recommendation: Recommendation;
  try {
    recommendation = await runAgentStream(history, onProgress);
  } catch (err) {
    await prisma.agentRun.create({
      data: {
        userId: userIdBigInt,
        userQuery,
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
    // 기록용 저장이 실패해도(DB 커넥션 풀 등) 이미 나온 LLM 응답 자체는 살린다 —
    // 카카오 장소 매칭 실패를 관대하게 처리하는 것과 같은 원칙.
    let agentRunId: string = randomUUID();
    try {
      const agentRun = await prisma.agentRun.create({
        data: {
          userId: userIdBigInt,
          userQuery,
          requestMode: "question",
          currentRegionId: region?.id,
          status: "completed",
          routeCount: 0,
          expiresAt: new Date(Date.now() + AGENT_RUN_TTL_MS),
          completedAt: new Date(),
        },
      });
      agentRunId = agentRun.id;
    } catch (err) {
      console.error("agentRun 기록 실패(추천 응답은 정상 반환):", err);
    }
    return {
      recommendation: { ...recommendation, places: undefined },
      agentRunId,
      recommendationRouteId: null,
    };
  }

  // 서로 의존하지 않는 조회라 순차로 기다릴 이유가 없다 — 병렬로 처리.
  const [weather, airQuality] = await Promise.all([
    regionName ? getCachedWeather(regionName) : Promise.resolve(null),
    regionName ? getCachedAirQuality(regionName) : Promise.resolve(null),
  ]);

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

  // 이 블록 전체(agentRun/route/routePlace 기록)가 실패해도(DB 커넥션 풀 등) 이미 LLM이
  // 만들어낸 추천과 카카오 매칭 결과는 살려서 사용자에게 그대로 돌려준다 — 카카오 장소
  // 매칭 실패를 관대하게 처리하는 것과 같은 원칙. agentRunId/recommendationRouteId는
  // 마이페이지 "최근 질문" 등 기록 조회용이라, 이번 요청 하나의 기록이 안 남는 것과
  // 방금 나온 추천 자체를 날리는 것 중 후자가 훨씬 나쁘다.
  let agentRunId: string = randomUUID();
  let recommendationRouteId: string | null = null;
  try {
    const agentRun = await prisma.agentRun.create({
      data: {
        userId: userIdBigInt,
        userQuery,
        requestMode: "question",
        currentRegionId: region?.id,
        status: unresolvedCount > 0 ? "partial" : "completed",
        routeCount: 1,
        dataUpdatedAt: new Date(),
        expiresAt: new Date(Date.now() + AGENT_RUN_TTL_MS),
        completedAt: new Date(),
      },
    });
    agentRunId = agentRun.id;

    const route = await prisma.recommendationRoute.create({
      data: {
        agentRunId: agentRun.id,
        rankNo: 1,
        title: regionName ? `${regionName} 나들이 코스` : "나들이 코스",
        recommendationReason: recommendation.message,
        environmentMode: inferEnvironmentMode(recommendation),
        // 우리가 실제로 아는 건 "사용자가 나들이 가려는 지역"(목적지)의 대기질뿐이다 —
        // origin(GPS 좌표)은 거리 배지 계산용일 뿐 대기질 스냅샷을 조회할 "지역"으로 쓰기엔
        // 너무 좁은 단위라 currentAirQualityId는 채우지 않는다.
        destinationAirQualityId: airQuality ? BigInt(airQuality.id) : undefined,
        weatherSnapshotId: weather ? BigInt(weather.id) : undefined,
      },
    });
    recommendationRouteId = route.id.toString();

    // 장소마다 독립적인 insert라 순차로 기다릴 이유가 없다 — 한 번에 배치로 처리.
    const routePlacesData = resolvedPlaces
      .filter((r) => r.place)
      .map(({ place, reason }, i) => ({
        routeId: route.id,
        sequenceNo: i + 1,
        placeId: place!.id,
        stopType: "visit",
        selectionReason: reason.slice(0, 1000),
        verificationRequired: false,
      }));
    if (routePlacesData.length > 0) {
      await prisma.routePlace.createMany({ data: routePlacesData });
    }
  } catch (err) {
    console.error("추천 기록 저장 실패(추천 결과는 정상 반환):", err);
  }

  const enrichedPlaces: EnrichedPlace[] = recommendation.places.map((p, i) => {
    const resolved = resolvedPlaces[i]?.place ?? null;
    const resolvedPoint = resolved
      ? { latitude: resolved.latitude.toNumber(), longitude: resolved.longitude.toNumber() }
      : null;
    return {
      ...p,
      category: extractCategoryLabel(resolved?.categorySummary ?? null),
      distanceKm: computeDistanceKm(origin ?? null, resolvedPoint),
      placeId: resolved?.publicId ?? null,
      latitude: resolvedPoint?.latitude ?? null,
      longitude: resolvedPoint?.longitude ?? null,
    };
  });

  return {
    recommendation: { ...recommendation, places: enrichedPlaces },
    agentRunId,
    recommendationRouteId,
  };
}
