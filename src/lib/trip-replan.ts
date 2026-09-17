import { z } from "zod";
import { activeTripSchema, parkingLocationSchema, tripStopSchema, type ActiveTrip, type TripStop } from "./active-trip";

export const pointSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
  .refine((p) => p.latitude !== 0 || p.longitude !== 0);
export const replanRequestSchema = z.object({ trip: activeTripSchema, visitMinutes: z.number().int().min(5).max(120) });
export const proposalSchema = z.object({
  id: z.string().min(1).max(100), tripId: z.string().min(1), baseRevision: z.number().int().nonnegative(),
  createdAt: z.string().datetime(), expiresAt: z.string().datetime(), origin: pointSchema,
  remainingStops: z.array(tripStopSchema.refine((s) => !s.visitedAt && s.latitude !== null && s.longitude !== null)).max(6),
  parking: parkingLocationSchema,
  travelMinutes: z.number().int().nonnegative(), visitMinutes: z.number().int().nonnegative(), estimatedMinutes: z.number().int().nonnegative(),
  effectiveMode: z.enum(["walk", "public_transit"]),
  explanation: z.string().max(2000), warnings: z.array(z.string().max(1000)).max(20),
}).superRefine((p, ctx) => {
  if (p.estimatedMinutes !== p.travelMinutes + p.visitMinutes || p.visitMinutes !== p.remainingStops.reduce((sum, s) => sum + (s.plannedVisitMinutes ?? 0), 0)) ctx.addIssue({ code: "custom", message: "이동·체류 시간 합계가 올바르지 않습니다." });
  if (new Set(p.remainingStops.map((s) => s.id)).size !== p.remainingStops.length || p.remainingStops.some((s) => !s.plannedVisitMinutes)) ctx.addIssue({ code: "custom", message: "장소 또는 체류 계획을 확인해 주세요." });
});
export type ReplanProposal = z.infer<typeof proposalSchema>;
export type Point = z.infer<typeof pointSchema>;

export function distanceM(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dlat = (b.latitude - a.latitude) * rad, dlng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dlng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function samePlace(a: TripStop, b: TripStop): boolean {
  if (a.id === b.id || (a.sourceId && b.sourceId && a.sourceId === b.sourceId)) return true;
  const compact = (v: string) => v.normalize("NFKC").replace(/[^a-z0-9가-힣]/gi, "").toLowerCase();
  if (compact(a.name) === compact(b.name)) return true;
  return a.latitude !== null && a.longitude !== null && b.latitude !== null && b.longitude !== null
    && distanceM(a as Point, b as Point) < 80 && (compact(a.name).includes(compact(b.name)) || compact(b.name).includes(compact(a.name)));
}

export function validateReplanTrip(trip: ActiveTrip, now = Date.now()): void {
  if (trip.status !== "active") throw new Error("진행 중인 여행에서만 변경할 수 있습니다.");
  if (!trip.parking) throw new Error("복귀할 주차 위치를 먼저 저장해 주세요.");
  const s = trip.situation;
  if (!s || s.baseRevision !== trip.revision || s.remainingMinutes !== trip.remainingMinutes) throw new Error("현장 상황을 다시 확인하고 저장해 주세요.");
  const age = now - Date.parse(s.currentLocation.capturedAt);
  if (age < -30_000 || age > 300_000) throw new Error("현재 위치 확인 후 5분이 지났습니다. 현장 상황에서 위치를 다시 확인해 주세요.");
  if (s.affectedStopId && !trip.stops.some((p) => p.id === s.affectedStopId && !p.visitedAt)) throw new Error("변경 대상은 아직 방문하지 않은 장소여야 합니다.");
  if (s.currentLocation.source === "stop" && !trip.stops.some((p) => p.id === s.currentLocation.stopId && p.latitude === s.currentLocation.latitude && p.longitude === s.currentLocation.longitude)) throw new Error("현재 위치로 선택한 장소를 다시 확인해 주세요.");
}

export function applyReplan(trip: ActiveTrip, proposal: ReplanProposal, now = Date.now()): ActiveTrip {
  validateReplanTrip(trip, now);
  const p = proposalSchema.parse(proposal);
  if (p.tripId !== trip.id || p.baseRevision !== trip.revision) throw new Error("여행 조건이 바뀌었습니다. 다시 추천해 주세요.");
  if (p.effectiveMode !== (trip.transportMode === "public_transit" ? "public_transit" : "walk")) throw new Error("이동수단이 일치하지 않습니다. 다시 추천해 주세요.");
  if (Date.parse(p.expiresAt) <= now || Date.parse(p.createdAt) > now + 30_000) throw new Error("변경안이 만료되었습니다. 현재 위치를 확인하고 다시 추천해 주세요.");
  if (p.parking.latitude !== trip.parking!.latitude || p.parking.longitude !== trip.parking!.longitude || p.parking.savedAt !== trip.parking!.savedAt || p.parking.label !== trip.parking!.label) throw new Error("주차 위치가 변경되었습니다. 다시 추천해 주세요.");
  if (distanceM(p.origin, trip.situation!.currentLocation) > 1) throw new Error("출발 위치가 변경되었습니다.");
  if (p.estimatedMinutes !== p.travelMinutes + p.visitMinutes || p.estimatedMinutes > trip.remainingMinutes) throw new Error("남은 시간 안에 복귀할 수 없는 변경안입니다.");
  const visited = trip.stops.filter((s) => s.visitedAt);
  const excluded = trip.stops.filter((s) => s.visitedAt || s.id === trip.situation!.affectedStopId);
  if (p.remainingStops.some((s, i) => excluded.some((v) => samePlace(s, v)) || p.remainingStops.slice(0, i).some((v) => samePlace(s, v)))) throw new Error("방문했거나 제외한 장소가 변경안에 포함되어 있습니다.");
  return activeTripSchema.parse({ ...trip, stops: [...visited, ...p.remainingStops], revision: trip.revision + 1, updatedAt: new Date(now).toISOString(), situation: null,
    appliedRoute: { id: p.id, acceptedAt: new Date(now).toISOString(), origin: p.origin, estimatedMinutes: p.estimatedMinutes, explanation: p.explanation, warnings: p.warnings },
  });
}
