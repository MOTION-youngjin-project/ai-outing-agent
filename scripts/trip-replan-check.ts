import assert from "node:assert/strict";
import { test } from "node:test";
import { activeTripSchema, type ActiveTrip, type TripStop } from "../src/lib/active-trip";
import { applyReplan, proposalSchema, replanRequestSchema } from "../src/lib/trip-replan";
import { createTripReplan, type ReplanDependencies } from "../src/lib/services/trip-replanning";
import { useActiveTrip } from "../src/lib/active-trip-store";

const stop = (id: string, lat: number, visited = false): TripStop => ({ id, sourceId: `kakao:${id}`, name: id, address: "대구 중구", latitude: lat, longitude: 128.6, visitedAt: visited ? new Date().toISOString() : null, tags: ["실내"] });
function fixture(): ActiveTrip {
  const now = new Date().toISOString();
  return activeTripSchema.parse({ version: 1, id: "trip", sourceRunId: "run", title: "대구 친구 여행", revision: 3, status: "active", startedAt: now, updatedAt: now, transportMode: "car", remainingMinutes: 120,
    stops: [stop("visited", 35.87, true), stop("closed", 35.871), stop("next", 35.875)],
    parking: { latitude: 35.869, longitude: 128.6, label: "주차장", source: "gps", accuracyM: 10, savedAt: now }, photoPreferences: ["노을", "골목"],
    situation: { reason: "closed", detail: "문을 닫았어요", affectedStopId: "closed", remainingMinutes: 120, baseRevision: 3, confirmedAt: now, currentLocation: { latitude: 35.871, longitude: 128.6, source: "gps", stopId: null, accuracyM: 10, capturedAt: now } },
  });
}
const deps = (overrides: Partial<ReplanDependencies> = {}): ReplanDependencies => ({ suggest: async () => [stop("replacement", 35.873)], leg: async () => ({ minutes: 5, estimated: false }), ...overrides });

test("미방문만 재추천하고 복귀 이동+체류 합계, 사진 취향과 방문 기록 보존", async () => {
  const trip = fixture(), before = structuredClone(trip);
  const p = await createTripReplan(trip, 20, deps());
  assert.deepEqual(trip, before);
  assert.deepEqual(p.remainingStops.map((s) => s.id), ["replacement", "next"]);
  assert.equal(p.travelMinutes, 15); assert.equal(p.visitMinutes, 40); assert.equal(p.estimatedMinutes, 55);
  assert.equal(p.effectiveMode, "walk"); assert.deepEqual(p.parking, trip.parking);
  const result = applyReplan(trip, p);
  assert.deepEqual(result.stops[0], trip.stops[0]);
  assert.deepEqual(result.photoPreferences, trip.photoPreferences);
  assert.equal(result.situation, null); assert.equal(result.revision, 4);
  assert.throws(() => applyReplan(result, p));
});
test("방문·휴무 장소의 다른 ID 후보와 중복 후보를 제외한다", async () => {
  const trip = fixture();
  const p = await createTripReplan(trip, 20, deps({ suggest: async () => [{ ...trip.stops[0], id: "alias", visitedAt: null }, { ...trip.stops[1], id: "another" }, stop("replacement", 35.873), stop("replacement", 35.873)] }));
  assert.equal(p.remainingStops.some((s) => s.name === "visited" || s.name === "closed"), false);
  assert.equal(new Set(p.remainingStops.map((s) => s.id)).size, p.remainingStops.length);
});
test("비에는 실내 후보, 피로에는 한 곳만 제안", async () => {
  const trip = fixture(); trip.situation!.reason = "rain"; trip.situation!.affectedStopId = null;
  const p = await createTripReplan(trip, 20, deps({ suggest: async () => [{ ...stop("outdoor", 35.872), tags: ["야외"] }, stop("indoor", 35.873)] }));
  assert.deepEqual(p.remainingStops.map((s) => s.id), ["indoor"]);
  trip.situation!.reason = "tired";
  assert.equal((await createTripReplan(trip, 20, deps())).remainingStops.length, 1);
});
test("시간에 안 맞는 추가 방문은 제외하고 주차장 직접 복귀", async () => {
  const trip = fixture(); trip.remainingMinutes = 15; trip.situation!.remainingMinutes = 15;
  let calls = 0;
  const p = await createTripReplan(trip, 20, deps({ suggest: async () => { calls++; return []; } }));
  assert.equal(calls, 0); assert.deepEqual(p.remainingStops, []); assert.equal(p.estimatedMinutes, 5);
  const result = applyReplan(trip, p); assert.equal(result.stops.length, 1); assert.ok(result.stops[0].visitedAt);
});
test("미방문만 있었던 여행도 직접 복귀 변경안을 저장할 수 있다", async () => {
  const trip = fixture(); trip.stops = trip.stops.filter((s) => !s.visitedAt); trip.remainingMinutes = 10; trip.situation!.remainingMinutes = 10;
  const result = applyReplan(trip, await createTripReplan(trip, 20, deps()));
  assert.deepEqual(result.stops, []); assert.ok(result.parking);
});
test("복귀 자체가 시간 초과면 후보 API 호출 없이 거부", async () => {
  let calls = 0;
  await assert.rejects(() => createTripReplan(fixture(), 20, deps({ leg: async () => ({ minutes: 121, estimated: false }), suggest: async () => { calls++; return []; } })), /복귀에만/);
  assert.equal(calls, 0);
});
test("경로·장소 API 오류는 기존 코스 변경 없이 오류", async () => {
  const trip = fixture(), before = structuredClone(trip);
  await assert.rejects(() => createTripReplan(trip, 20, deps({ leg: async () => null })), /이동 시간을 확인/);
  await assert.rejects(() => createTripReplan(trip, 20, deps({ suggest: async () => { throw new Error("provider"); } })), /대체 장소를 조회/);
  assert.deepEqual(trip, before);
});
test("후보 없음·좌표 없음이면 이유와 직접 복귀안을 제공", async () => {
  const p = await createTripReplan(fixture(), 20, deps({ suggest: async () => [{ ...stop("invalid", 35.87), latitude: null, longitude: null }] }));
  assert.deepEqual(p.remainingStops, []); assert.match(p.explanation, /확인하지 못/);
});
test("추정 구간 표시와 대중교통 모드 전달", async () => {
  const trip = fixture(); trip.transportMode = "public_transit";
  const modes: string[] = [];
  const p = await createTripReplan(trip, 20, deps({ leg: async (_a, _b, mode) => { modes.push(mode); return { minutes: 4, estimated: true }; } }));
  assert.ok(modes.every((m) => m === "public_transit")); assert.ok(p.warnings.some((w) => w.includes("추정치")));
});
test("잘못된 상태·대상·기한과 주차 누락을 서버에서도 거부", async () => {
  for (const alter of [(t: ActiveTrip) => { t.parking = null; }, (t: ActiveTrip) => { t.revision++; }, (t: ActiveTrip) => { t.situation!.affectedStopId = "visited"; }, (t: ActiveTrip) => { t.situation!.currentLocation.capturedAt = "2020-01-01T00:00:00.000Z"; }]) {
    const trip = fixture(); alter(trip); await assert.rejects(() => createTripReplan(trip, 20, deps()));
  }
  assert.equal(replanRequestSchema.safeParse({ trip: fixture(), visitMinutes: 0 }).success, false);
});
test("만료·주차 변경·방문 중복·시간 초과·잘못된 여행 응답은 수락 불가", async () => {
  const trip = fixture(), p = await createTripReplan(trip, 20, deps());
  for (const patch of [{ tripId: "other" }, { baseRevision: 0 }, { expiresAt: "2020-01-01T00:00:00.000Z" }, { parking: { ...p.parking, latitude: 36 } }, { remainingStops: [{ ...trip.stops[0], visitedAt: null }] }, { estimatedMinutes: 300 }]) {
    assert.throws(() => applyReplan(trip, { ...p, ...patch }));
  }
  assert.equal(proposalSchema.safeParse({ ...p, remainingStops: [{ ...stop("bad", 35), longitude: null }] }).success, false);
});
test("수락 저장 실패는 기존 코스 보존, 성공만 목록·복원 값 갱신", async () => {
  const trip = fixture(), p = await createTripReplan(trip, 20, deps());
  useActiveTrip.setState({ trip, hydrated: true, error: "" });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { setItem: () => { throw new Error("quota"); } } });
  assert.equal(useActiveTrip.getState().acceptReplan(p), false); assert.deepEqual(useActiveTrip.getState().trip, trip);
  let raw = ""; localStorage.setItem = (_key, value) => { raw = value; };
  assert.equal(useActiveTrip.getState().acceptReplan(p), true);
  assert.deepEqual(JSON.parse(raw), useActiveTrip.getState().trip);
  assert.equal(useActiveTrip.getState().acceptReplan(p), false);
});
