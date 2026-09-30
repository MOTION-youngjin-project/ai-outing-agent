import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { restoreTrip, updateTrip, TRIP_STORAGE_KEY, type ActiveTrip } from "../src/lib/active-trip";
import { useActiveTrip } from "../src/lib/active-trip-store";
import { situationSchema, type TripSituationInput } from "../src/lib/trip-situation";

const now = "2026-09-16T00:00:00.000Z";
const fixture = (): ActiveTrip => ({ version: 1, id: "trip-1", sourceRunId: "run-1", title: "대구 여행", revision: 0, status: "active", startedAt: now, updatedAt: now, transportMode: "walk", remainingMinutes: 180, stops: [{ id: "a", name: "장소 A", address: null, latitude: 35.87, longitude: 128.6, visitedAt: null }, { id: "b", name: "장소 B", address: null, latitude: null, longitude: null, visitedAt: null }] });
let memory = new Map<string, string>();
beforeEach(() => {
  memory = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) } });
  useActiveTrip.setState({ trip: null, hydrated: false, error: "" });
});

test("새로고침 복원이 저장값을 초기 상태로 덮어쓰지 않는다", () => {
  const saved = updateTrip(fixture(), { stopId: "a" });
  memory.set(TRIP_STORAGE_KEY, JSON.stringify(saved));
  useActiveTrip.getState().start(fixture());
  assert.equal(useActiveTrip.getState().trip, null);
  useActiveTrip.getState().hydrate();
  assert.deepEqual(useActiveTrip.getState().trip, saved);
  assert.deepEqual(restoreTrip(memory.get(TRIP_STORAGE_KEY)!), saved);
});
test("방문 토글은 안정적인 ID를 사용하고 다른 장소는 유지한다", () => {
  const original = fixture();
  const updated = updateTrip(original, { stopId: "b" });
  assert.equal(original.stops[1].visitedAt, null);
  assert.ok(updated.stops[1].visitedAt);
  assert.equal(updated.stops[0].visitedAt, null);
  assert.equal(updateTrip(updated, { stopId: "b" }).stops[1].visitedAt, null);
  assert.throws(() => updateTrip(original, { stopId: "missing" }));
});
test("시간 검증과 종료 후 변경 제한", () => {
  for (const remainingMinutes of [0, -1, 1.5, 1441, NaN]) assert.throws(() => updateTrip(fixture(), { remainingMinutes }));
  assert.equal(updateTrip(fixture(), { remainingMinutes: 60 }).remainingMinutes, 60);
  assert.throws(() => updateTrip(updateTrip(fixture(), { finish: true }), { stopId: "a" }));
});
test("손상·다른 버전·중복 ID·잘못된 좌표는 복원하지 않는다", () => {
  assert.throws(() => restoreTrip("{"));
  assert.throws(() => restoreTrip(JSON.stringify({ ...fixture(), version: 2 })));
  assert.throws(() => restoreTrip(JSON.stringify({ ...fixture(), stops: [fixture().stops[0], fixture().stops[0]] })));
  assert.throws(() => restoreTrip(JSON.stringify({ ...fixture(), stops: [{ ...fixture().stops[0], latitude: 100 }] })));
  memory.set(TRIP_STORAGE_KEY, "{");
  useActiveTrip.getState().hydrate();
  assert.equal(memory.get(TRIP_STORAGE_KEY), "{");
  assert.ok(useActiveTrip.getState().error);
  useActiveTrip.getState().clear();
  assert.equal(memory.has(TRIP_STORAGE_KEY), false);
});
test("새 여행으로 진행 중 여행을 교체하지 않는다", () => {
  useActiveTrip.getState().hydrate();
  useActiveTrip.getState().start(fixture());
  useActiveTrip.getState().start({ ...fixture(), id: "replacement" });
  assert.equal(useActiveTrip.getState().trip?.id, "trip-1");
  useActiveTrip.getState().change({ finish: true });
  useActiveTrip.getState().start({ ...fixture(), id: "replacement" });
  assert.equal(useActiveTrip.getState().trip?.id, "replacement");
});
test("저장 실패 시 화면 상태 유지, 삭제 실패 시 기존 여행 유지", () => {
  useActiveTrip.getState().hydrate();
  localStorage.setItem = () => { throw new Error("quota"); };
  useActiveTrip.getState().start(fixture());
  assert.equal(useActiveTrip.getState().trip?.id, "trip-1");
  assert.match(useActiveTrip.getState().error, /새로고침/);
  localStorage.removeItem = () => { throw new Error("blocked"); };
  useActiveTrip.getState().clear();
  assert.ok(useActiveTrip.getState().trip);
  assert.match(useActiveTrip.getState().error, /삭제하지 못/);
});

const parking = { latitude: 35.8714, longitude: 128.6014, label: "주차 위치", savedAt: now, source: "gps" as const, accuracyM: 30 };
test("기존 v1 호환 및 주차 위치 1곳 저장·수정·복원·삭제", () => {
  assert.equal(restoreTrip(JSON.stringify(fixture()))?.parking, undefined);
  useActiveTrip.getState().hydrate();
  useActiveTrip.getState().start(fixture());
  assert.equal(useActiveTrip.getState().setParking("trip-1", parking), true);
  assert.deepEqual(restoreTrip(memory.get(TRIP_STORAGE_KEY)!)?.parking, parking);
  assert.equal(useActiveTrip.getState().setParking("trip-1", { ...parking, label: "수정 위치", latitude: 35.88, source: "map", accuracyM: null }), true);
  assert.equal(useActiveTrip.getState().trip?.parking?.label, "수정 위치");
  assert.equal(useActiveTrip.getState().trip?.revision, 2);
  assert.equal(useActiveTrip.getState().setParking("trip-1", null), true);
  assert.equal(restoreTrip(memory.get(TRIP_STORAGE_KEY)!)?.parking, null);
});
test("주차 위치 저장·삭제 실패와 오래된 여행 요청은 기존 위치를 보존한다", () => {
  useActiveTrip.getState().hydrate();
  useActiveTrip.getState().start(fixture());
  useActiveTrip.getState().setParking("trip-1", parking);
  const original = useActiveTrip.getState().trip;
  assert.equal(useActiveTrip.getState().setParking("old-trip", null), false);
  assert.equal(useActiveTrip.getState().setParking("trip-1", { ...parking, latitude: 100 }), false);
  localStorage.setItem = () => { throw new Error("quota"); };
  assert.equal(useActiveTrip.getState().setParking("trip-1", null), false);
  assert.equal(useActiveTrip.getState().setParking("trip-1", { ...parking, latitude: 35.9 }), false);
  assert.deepEqual(useActiveTrip.getState().trip, original);
  assert.deepEqual(restoreTrip(memory.get(TRIP_STORAGE_KEY)!)?.parking, parking);
});
test("종료 여행에는 주차 위치를 덮어쓰지 않는다", () => {
  useActiveTrip.getState().hydrate();
  useActiveTrip.getState().start(fixture());
  useActiveTrip.getState().change({ finish: true });
  assert.equal(useActiveTrip.getState().setParking("trip-1", parking), false);
});

const situation = (): TripSituationInput => ({ reason: "closed", detail: "현장 안내문 확인", affectedStopId: "b", remainingMinutes: 60, currentLocation: { latitude: 35.87, longitude: 128.6, source: "gps", stopId: null, accuracyM: 20, capturedAt: new Date().toISOString() } });
test("상황 저장·복원은 기존 장소와 주차 위치를 유지하고 중복 제출을 막는다", () => {
  useActiveTrip.getState().hydrate(); useActiveTrip.getState().start(fixture());
  useActiveTrip.getState().setParking("trip-1", parking);
  const input = situation();
  assert.equal(useActiveTrip.getState().confirmSituation("trip-1", 1, input), true);
  const saved = restoreTrip(memory.get(TRIP_STORAGE_KEY)!);
  assert.deepEqual(saved?.stops, fixture().stops);
  assert.deepEqual(saved?.parking, parking);
  assert.equal(saved?.situation?.baseRevision, 2);
  assert.equal(saved?.remainingMinutes, 60);
  assert.equal(useActiveTrip.getState().confirmSituation("trip-1", 1, input), false);
  useActiveTrip.getState().change({ stopId: "a" });
  assert.equal(useActiveTrip.getState().trip?.situation, null);
});
test("빈 자유 입력·대상 누락·잘못된 시간과 위치를 거부한다", () => {
  const base = situation();
  for (const input of [
    { ...base, reason: "other", detail: "  " }, { ...base, affectedStopId: null },
    { ...base, reason: "crowded", affectedStopId: null }, { ...base, remainingMinutes: 0 },
    { ...base, remainingMinutes: 1.5 }, { ...base, detail: "a".repeat(1001) },
    { ...base, currentLocation: { ...base.currentLocation, latitude: 100 } },
  ]) assert.equal(situationSchema.safeParse(input).success, false);
});
test("지난 위치·방문한 대상·다른 여행·변조한 장소 위치를 거부한다", () => {
  useActiveTrip.getState().hydrate(); useActiveTrip.getState().start(fixture());
  const base = situation();
  assert.equal(useActiveTrip.getState().confirmSituation("other", 0, base), false);
  assert.equal(useActiveTrip.getState().confirmSituation("trip-1", 0, { ...base, currentLocation: { ...base.currentLocation, capturedAt: now } }), false);
  assert.equal(useActiveTrip.getState().confirmSituation("trip-1", 0, { ...base, currentLocation: { ...base.currentLocation, source: "stop", stopId: "a", latitude: 36 } }), false);
  useActiveTrip.getState().change({ stopId: "b" });
  assert.equal(useActiveTrip.getState().confirmSituation("trip-1", 1, base), false);
  assert.equal(useActiveTrip.getState().trip?.situation, null);
});
test("상황 저장 실패는 기존 시간과 상황을 보존한다", () => {
  useActiveTrip.getState().hydrate(); useActiveTrip.getState().start(fixture());
  const before = useActiveTrip.getState().trip;
  localStorage.setItem = () => { throw new Error("quota"); };
  assert.equal(useActiveTrip.getState().confirmSituation("trip-1", 0, situation()), false);
  assert.deepEqual(useActiveTrip.getState().trip, before);
});
