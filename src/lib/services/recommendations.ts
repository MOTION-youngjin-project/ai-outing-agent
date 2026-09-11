import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { normalizeSido } from "@/lib/region";
import { runAgentStream, type AgentProgressEvent, type ChatTurn, type Recommendation } from "@/lib/agent";
import { getCachedWeather } from "./weather";
import { getCachedAirQuality } from "./airQuality";
import { resolvePlaceByName, resolveDaeguDistrict } from "./places";
import { fetchDrivingRoute } from "./naverDirections";
import { findOrCreateSidoRegion } from "./shared";
import { inferEnvironmentMode, extractCategoryLabel, computeDistanceKm } from "./matching";
import type { Place } from "../../../generated/prisma/client";
import { searchDaeguTourismCached } from "../external/tour-api";
import { verifyPlace } from "../place-verification";

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
  // 코스상 바로 이전 정류지(없으면 origin)에서 이 장소까지의 네이버 Directions 자동차
  // 경로. 실패/좌표 없음/코스 첫 장소인데 origin도 없음 — 전부 null(배지 미표시).
  travelDistanceM: number | null;
  travelDurationMin: number | null;
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
  userId?: string | null,
  sessionKeyHash?: string | null
): Promise<RecommendationRunResult> {
  const regionName = normalizeSido(history.map((h) => h.content).join(" "));
  const region = regionName ? await findOrCreateSidoRegion(regionName) : null;
  // 마이페이지 "최근 질문"에 그대로 보여줄 사용자 원문 — history의 마지막 turn이
  // 이번 요청에서 사용자가 실제로 입력한 문장이다(이전 turn은 이미 지난 질문).
  const userQuery = userId ? [...history].reverse().find(h => h.role === "user")?.content.slice(0, 1000) : undefined;
  const userIdBigInt = userId ? BigInt(userId) : undefined;

  let recommendation: Recommendation;
  try {
    recommendation = await runAgentStream(history, onProgress);
  } catch (err) {
    await prisma.agentRun.create({
      data: {
        userId: userIdBigInt,
        sessionKeyHash: userId ? null : sessionKeyHash,
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
        sessionKeyHash: userId ? null : sessionKeyHash,
          userQuery,
          requestMode: "question",
          currentRegionId: region?.id,
          status: "completed",
          routeCount: 0,
          recommendationJson: JSON.parse(JSON.stringify({ ...recommendation, places: undefined })),
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

  // route_places.enriched_snapshot에 그대로 저장할 값이라 routePlace insert보다 먼저
  // 계산해둔다(라우팅 전환: /recommend/[runId]/place/[placeId] 새로고침 시 이 스냅샷으로
  // LLM이 만든 reason/tags/features 등을 복원한다 — Place 테이블엔 없는 값들).
  const enrichedPlaces: EnrichedPlace[] = await Promise.all(
    recommendation.places.map(async (p, i) => {
      const resolved = resolvedPlaces[i]?.place ?? null;
      const resolvedPoint = resolved
        ? { latitude: resolved.latitude.toNumber(), longitude: resolved.longitude.toNumber() }
        : null;
      let evidence: Parameters<typeof verifyPlace>[1] = [];
      if (resolved && (resolved.roadAddress ?? resolved.jibunAddress ?? "").startsWith("대구") && (process.env.DATA_GO_KR_API_KEY || process.env.TOUR_API_KEY)) {
        try {
          const tourism = await searchDaeguTourismCached(resolved.name, 5);
          evidence = tourism.data.map(item => ({ ...item, cachedAt: tourism.cachedAt, expiresAt: tourism.expiresAt, cache: tourism.cache }));
        } catch { /* 정보 미조회 시 변동 정보는 숨기고 추천을 유지한다. */ }
      }
      const verified = verifyPlace({ ...p, address: resolved?.roadAddress ?? p.address }, evidence);
      return {
        ...verified,
        category: extractCategoryLabel(resolved?.categorySummary ?? null),
        distanceKm: computeDistanceKm(origin ?? null, resolvedPoint),
        placeId: resolved?.publicId ?? null,
        latitude: resolvedPoint?.latitude ?? null,
        longitude: resolvedPoint?.longitude ?? null,
        travelDistanceM: null,
        travelDurationMin: null,
        // LLM은 대구 안 유명 장소인데도 daeguDistrict를 자주 비우고(주차 버튼이 통째로
        // 비활성됨) 가끔 틀린 구를 채운다 — 카카오로 실제 Place를 찾았으면 그 주소에서
        // 나온 구/군을 정답으로 덮어쓰고, 못 찾았을 때만 LLM 값을 그대로 둔다.
        daeguDistrict: resolved ? ((await resolveDaeguDistrict(resolved.regionId)) ?? undefined) : p.daeguDistrict,
      };
    })
  );

  // 코스 순서(카카오로 실제 좌표를 찾은 장소만, LLM 원본 순서 유지)를 따라 이전
  // 정류지→이 정류지 자동차 이동시간을 네이버 Directions로 채운다. origin이 있으면
  // 첫 정류지도 "지금 위치→첫 정류지" 구간으로 채운다. 구간마다 독립 호출이라 병렬 처리
  // — 실패한 구간은 travelByIndex에 안 들어가서 null로 남는다(카카오 매칭 실패 처리와
  // 같은 원칙, 전체 추천을 막지 않는다).
  const resolvedInOrder = resolvedPlaces.map((r, index) => ({ ...r, index })).filter((r) => r.place !== null);
  const travelByIndex = new Map<number, { travelDistanceM: number; travelDurationMin: number }>();
  await Promise.all(
    resolvedInOrder.map(async ({ place, index }, i) => {
      const prevPoint =
        i === 0
          ? origin
          : {
              latitude: resolvedInOrder[i - 1].place!.latitude.toNumber(),
              longitude: resolvedInOrder[i - 1].place!.longitude.toNumber(),
            };
      if (!prevPoint) return;
      const leg = await fetchDrivingRoute(prevPoint, {
        latitude: place!.latitude.toNumber(),
        longitude: place!.longitude.toNumber(),
      });
      if (leg) travelByIndex.set(index, { travelDistanceM: leg.distanceM, travelDurationMin: leg.durationMin });
    })
  );
  for (const [index, leg] of travelByIndex) {
    enrichedPlaces[index].travelDistanceM = leg.travelDistanceM;
    enrichedPlaces[index].travelDurationMin = leg.travelDurationMin;
  }

  // 이 블록 전체(agentRun/route/routePlace 기록)가 실패해도(DB 커넥션 풀 등) 이미 LLM이
  // 만들어낸 추천과 카카오 매칭 결과는 살려서 사용자에게 그대로 돌려준다 — 카카오 장소
  // 매칭 실패를 관대하게 처리하는 것과 같은 원칙. agentRunId/recommendationRouteId는
  // 마이페이지 "최근 질문" 등 기록 조회용이라, 이번 요청 하나의 기록이 안 남는 것과
  // 방금 나온 추천 자체를 날리는 것 중 후자가 훨씬 나쁘다.
  let agentRunId: string = randomUUID();
  let recommendationRouteId: string | null = null;
  try {
    const saved = await prisma.$transaction(async tx => {
    const agentRun = await tx.agentRun.create({
      data: {
        userId: userIdBigInt,
        sessionKeyHash: userId ? null : sessionKeyHash,
        userQuery,
        requestMode: "question",
        currentRegionId: region?.id,
        status: unresolvedCount > 0 ? "partial" : "completed",
        routeCount: 1,
        recommendationJson: JSON.parse(JSON.stringify({ ...recommendation, places: enrichedPlaces })),
        dataUpdatedAt: new Date(),
        expiresAt: new Date(Date.now() + AGENT_RUN_TTL_MS),
        completedAt: new Date(),
      },
    });
    const route = await tx.recommendationRoute.create({
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

    // 장소마다 독립적인 insert라 순차로 기다릴 이유가 없다 — 한 번에 배치로 처리.
    // 카카오 매칭 실패한 곳(placeId FK 없음)은 여기서 제외되므로, "partial" 런을
    // /recommend/[runId]로 나중에 다시 열면 그때 봤던 장소보다 적게 보일 수 있다 —
    // 기존에도 있던 한계(agentRun.status가 partial로 남는 것과 같은 원인)라 새로 감수하는
    // 트레이드오프는 아니다.
    // enrichedPlaces는 LLM이 준 원본 순서 그대로라, filter 뒤의 인덱스로 접근하면
    // 매칭 실패한 장소가 하나라도 있을 때 스냅샷이 밀려서 엉뚱한 장소에 붙는다 —
    // 원본 인덱스를 들고 다닌 뒤에 거른다.
    const routePlacesData = resolvedPlaces
      .map((r, index) => ({ ...r, index }))
      .filter((r) => r.place)
      .map(({ place, reason, index }, i) => ({
        routeId: route.id,
        sequenceNo: i + 1,
        placeId: place!.id,
        stopType: "visit",
        selectionReason: reason.slice(0, 1000),
        verificationRequired: false,
        travelDistanceM: enrichedPlaces[index].travelDistanceM,
        travelDurationMin: enrichedPlaces[index].travelDurationMin,
        enrichedSnapshot: enrichedPlaces[index],
      }));
    if (routePlacesData.length > 0) {
      await tx.routePlace.createMany({ data: routePlacesData });
    }
    return { agentRunId: agentRun.id, recommendationRouteId: route.id.toString() };
    });
    agentRunId = saved.agentRunId;
    recommendationRouteId = saved.recommendationRouteId;
  } catch (err) {
    console.error("추천 기록 저장 실패(추천 결과는 정상 반환):", err);
  }

  return {
    recommendation: { ...recommendation, places: enrichedPlaces },
    agentRunId,
    recommendationRouteId,
  };
}
