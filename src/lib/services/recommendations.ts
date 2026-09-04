import { prisma } from "@/lib/prisma";
import { normalizeSido } from "@/lib/region";
import { runAgent, type ChatTurn, type Recommendation, type RecommendationWithParking } from "@/lib/agent";
import { getAndStoreParkingOptions } from "./parking";
import { getCachedWeather } from "./weather";
import { getCachedAirQuality } from "./airQuality";
import { resolvePlaceByName } from "./places";
import { findOrCreateSidoRegion } from "./shared";
import { inferEnvironmentMode } from "./matching";
import type { Place } from "../../../generated/prisma/client";

export interface RecommendationRunResult {
  recommendation: RecommendationWithParking;
  agentRunId: string;
  recommendationRouteId: string | null;
}

export type TransportMode = "car" | "public_transit" | "walk";

export interface RecommendationRunOptions {
  transportMode?: TransportMode;
}

const PARKING_NOTICE =
  "지도 좌표가 없어 같은 구·군의 주차장을 무료 여부, 규모, 실시간 정보 제공 여부로 선정했습니다. 실제 거리와 이동시간은 별도로 확인해 주세요.";

function hasCarIntent(history: ChatTurn[]): boolean {
  const latestUserText = [...history].reverse().find((turn) => turn.role === "user")?.content ?? "";
  if (/(대중교통|지하철|버스|도보|걸어서|차\s*(?:없이|안\s*타고))/i.test(latestUserText)) return false;
  return /(자동차|자차|차량|차로|운전|드라이브|주차)/i.test(latestUserText);
}

async function attachParkingOptions(
  recommendation: Recommendation,
  history: ChatTurn[],
  transportMode?: TransportMode,
): Promise<RecommendationWithParking> {
  const useCar = transportMode === "car" || (transportMode === undefined && hasCarIntent(history));
  if (!useCar || !recommendation.places) return recommendation;

  const districts = [...new Set(recommendation.places.map((place) => place.daeguDistrict).filter(Boolean))] as string[];
  const parkingByDistrict = new Map<string, Awaited<ReturnType<typeof getAndStoreParkingOptions>>>();

  await Promise.all(
    districts.map(async (district) => {
      try {
        parkingByDistrict.set(district, await getAndStoreParkingOptions(district));
      } catch (error) {
        console.error(`주차장 조회 실패(${district}):`, error);
        parkingByDistrict.set(district, []);
      }
    }),
  );

  return {
    ...recommendation,
    places: recommendation.places.map((place) => ({
      ...place,
      parkingOptions: place.daeguDistrict ? (parkingByDistrict.get(place.daeguDistrict) ?? []) : [],
      parkingNotice: place.daeguDistrict ? PARKING_NOTICE : "대구 구·군을 확인할 수 없어 주차장을 조회하지 못했습니다.",
    })),
  };
}

// ponytail: "이 추천이 유효하다고 볼 기간" — 24시간으로 잡음, 조정 가능.
const AGENT_RUN_TTL_MS = 24 * 60 * 60 * 1000;

// 작업 순서표 13번. 기존 runAgent(LLM)의 결과는 그대로 쓰고(agent.ts는 안 건드림),
// 그 결과를 agent_runs/recommendation_routes/route_places에 기록만 새로 붙인다.
export async function createRecommendationRun(
  history: ChatTurn[],
  options: RecommendationRunOptions = {},
): Promise<RecommendationRunResult> {
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

  const [weather, airQuality] = regionName
    ? await Promise.all([getCachedWeather(regionName), getCachedAirQuality(regionName)])
    : [null, null];

  // LLM이 이름만 준 장소를 네이버 검색으로 좌표 있는 Place와 매칭한다. 완벽한 매칭은
  // 보장 못 해서(동명이인 장소) 못 찾은 곳은 route_places에 기록 자체를 못 한다
  // (placeId가 필수 FK라 실제 Place 없이는 만들 수 없음) — 그런 곳이 있으면
  // agent_runs.status를 partial로 표시해서 "LLM은 N곳을 추천했지만 실제 저장된
  // route_places는 그보다 적을 수 있다"는 걸 나중에 알 수 있게 한다.
  const resolvedPlaces: { place: Place | null; reason: string }[] = await Promise.all(
    recommendation.places.map(async (p) => {
      // 네이버 API가 실패해도(네트워크/쿼터) 이미 나온 LLM 추천 자체는 살려야 한다 —
      // 이 장소 하나만 못 찾은 것으로 취급하고 전체 요청을 실패시키지 않는다.
      let place: Place | null = null;
      try {
        place = await resolvePlaceByName(p.name, regionName);
      } catch (err) {
        console.error(`장소 매칭 실패(${p.name}):`, err);
      }
      return { place, reason: p.reason };
    }),
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

  const recommendationWithParking = await attachParkingOptions(
    recommendation,
    history,
    options.transportMode,
  );

  return {
    recommendation: recommendationWithParking,
    agentRunId: agentRun.id,
    recommendationRouteId: route.id.toString(),
  };
}
