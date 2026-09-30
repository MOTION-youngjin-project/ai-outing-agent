import { randomUUID } from "node:crypto";
import type { ActiveTrip, TripStop } from "../active-trip";
import { distanceM, pointSchema, proposalSchema, samePlace, validateReplanTrip, type Point, type ReplanProposal } from "../trip-replan";
import { SITUATION_LABELS } from "../trip-situation";

export type Leg = { minutes: number; estimated: boolean };
export type ReplanDependencies = {
  suggest: (trip: ActiveTrip) => Promise<TripStop[]>;
  leg: (from: Point, to: Point, mode: "walk" | "public_transit") => Promise<Leg | null>;
};
export class ReplanError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}

// 방문 기록 보존·주차장 복귀·시간 제약은 모델 응답과 별개로 코드에서 보장한다.
export async function createTripReplan(trip: ActiveTrip, visitMinutes: number, deps: ReplanDependencies): Promise<ReplanProposal> {
  try { validateReplanTrip(trip); } catch (error) { throw new ReplanError((error as Error).message, 409); }
  const situation = trip.situation!;
  const origin = situation.currentLocation;
  const parking = trip.parking!;
  const effectiveMode = trip.transportMode === "public_transit" ? "public_transit" : "walk";
  const cache = new Map<string, Promise<Leg | null>>();
  function leg(a: Point, b: Point): Promise<Leg | null> {
    const key = `${a.latitude},${a.longitude}:${b.latitude},${b.longitude}`;
    if (!cache.has(key)) cache.set(key, distanceM(a, b) < 10 ? Promise.resolve({ minutes: 0, estimated: false }) : deps.leg(a, b, effectiveMode).then((value) => value && Number.isFinite(value.minutes) && value.minutes > 0 ? { ...value, minutes: Math.ceil(value.minutes) } : null).catch(() => null));
    return cache.get(key)!;
  }
  async function route(stops: TripStop[]) {
    const points = [origin, ...stops as (TripStop & Point)[], parking];
    const legs = await Promise.all(points.slice(0, -1).map((from, i) => leg(from, points[i + 1])));
    if (legs.some((l) => !l)) return null;
    return { travel: legs.reduce((sum, l) => sum + l!.minutes, 0), estimated: legs.some((l) => l!.estimated) };
  }
  const direct = await route([]);
  if (!direct) throw new ReplanError("주차장까지의 이동 시간을 확인하지 못했습니다. 기존 코스를 유지합니다. 잠시 후 다시 시도해 주세요.", 503);
  if (direct.travel > trip.remainingMinutes) throw new ReplanError(`주차장 복귀에만 약 ${direct.travel}분이 필요해 남은 ${trip.remainingMinutes}분을 넘습니다. 남은 시간을 조정하거나 바로 복귀해 주세요.`);
  const excluded = trip.stops.filter((s) => s.visitedAt || s.id === situation.affectedStopId);
  const valid = (s: TripStop) => !s.visitedAt && pointSchema.safeParse(s).success && !excluded.some((v) => samePlace(s, v)) && distanceM(origin, s as Point) <= 5000;
  const rainSuitable = (s: TripStop) => s.tags?.includes("실내") === true;
  let proposed: TripStop[] = [];
  let total = direct;
  let noAlternatives = false;
  if (direct.travel + visitMinutes <= trip.remainingMinutes && trip.stops.some((s) => !s.visitedAt)) {
    let candidates: TripStop[];
    try { candidates = await deps.suggest(trip); } catch { throw new ReplanError("대체 장소를 조회하지 못했습니다. 기존 코스는 유지됩니다. 잠시 후 다시 시도해 주세요.", 502); }
    candidates = candidates.filter(valid).filter((s) => situation.reason !== "rain" || rainSuitable(s)).sort((a, b) => distanceM(origin, a as Point) - distanceM(origin, b as Point)).slice(0, 3);
    noAlternatives = candidates.length === 0;
    for (const candidate of candidates) {
      const trial = await route([candidate]);
      if (trial && trial.travel + visitMinutes <= trip.remainingMinutes) { proposed = [candidate]; total = trial; break; }
    }
    // 휴무·혼잡은 해당 장소를 대체하고 나머지 일정을 가능한 범위에서 보존한다.
    const keep = situation.reason === "closed" || situation.reason === "crowded";
    if (keep && proposed.length) {
      const remaining = trip.stops.filter(valid).filter((s) => !samePlace(s, proposed[0])).sort((a, b) => distanceM(proposed[0] as Point, a as Point) - distanceM(proposed[0] as Point, b as Point)).slice(0, 3);
      for (const stop of remaining) {
        if (proposed.length >= 3 || proposed.some((s) => samePlace(s, stop))) continue;
        const trial = await route([...proposed, stop]);
        if (trial && trial.travel + (proposed.length + 1) * visitMinutes <= trip.remainingMinutes) { proposed.push(stop); total = trial; }
      }
    }
  }
  const warnings = ["이동 시간은 출발 시각·날씨·현장 상황에 따라 달라집니다.", `장소당 ${visitMinutes}분은 사용자가 정한 체류 계획이며 실제 관람 소요시간이 아닙니다.`];
  if (total.estimated) warnings.push("일부 도보 구간은 실제 경로 조회가 안 되어 직선거리 × 1.4 ÷ 분당 60m로 계산한 추정치입니다. 도로·횡단·출입구에 따라 실제 시간은 더 길 수 있습니다.");
  if (trip.transportMode === "car") warnings.push("차는 저장된 주차장에 둔 상태로 가정하여 남은 일정과 복귀를 도보로 계산했습니다.");
  if (effectiveMode === "public_transit") warnings.push("대중교통은 현재 조회 시점의 예상 시간입니다. 각 방문 후 배차·환승 시간을 다시 확인해 주세요.");
  if (proposed.length) warnings.push("실시간 영업·좌석·혼잡은 확인되지 않았습니다. 방문 전 운영 여부를 확인해 주세요.");
  if (situation.reason === "rain" && proposed.length) warnings.push("실내 태그를 가진 후보를 우선했습니다. 입구까지의 야외 이동은 남아 있습니다.");
  if (trip.photoPreferences?.length) warnings.push("촬영 취향을 후보 추천에 전달했습니다. 현장 촬영 조건은 별도 확인이 필요합니다.");
  const explanation = proposed.length ? `${SITUATION_LABELS[situation.reason]} 상황을 반영해 가까운 대체 장소를 먼저 방문하고 주차장으로 복귀합니다. 방문 완료 장소는 유지하며 시간에 맞지 않는 남은 장소는 제외했습니다.` : `${noAlternatives ? "조건에 맞는 대체 장소를 확인하지 못했습니다." : "남은 시간 안에 추가 방문과 주차장 복귀를 함께 배치하기 어렵거나 남은 방문지가 없습니다."} 추가 방문 없이 주차장으로 바로 돌아가는 안입니다.`;
  const created = Date.now();
  try { validateReplanTrip(trip, created); } catch { throw new ReplanError("현재 위치가 오래되었습니다. 현장 상황에서 위치를 다시 확인해 주세요.", 409); }
  return proposalSchema.parse({ id: randomUUID(), tripId: trip.id, baseRevision: trip.revision, createdAt: new Date(created).toISOString(), expiresAt: new Date(Math.min(created + 300000, Date.parse(origin.capturedAt) + 300000)).toISOString(), origin,
    remainingStops: proposed.map((s) => ({ ...s, plannedVisitMinutes: visitMinutes })), parking, travelMinutes: total.travel, visitMinutes: proposed.length * visitMinutes, estimatedMinutes: total.travel + proposed.length * visitMinutes, effectiveMode, explanation, warnings });
}
