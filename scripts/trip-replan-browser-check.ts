import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { createTripReplan } from "../src/lib/services/trip-replanning";
import { activeTripSchema } from "../src/lib/active-trip";

const origin = process.env.REPLAN_TEST_ORIGIN ?? "http://localhost:3104";
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge" });
const now = new Date().toISOString();
const trip = activeTripSchema.parse({ version: 1, id: "browser-trip", sourceRunId: "run", title: "대구 여행", revision: 1, status: "active", startedAt: now, updatedAt: now, transportMode: "car", remainingMinutes: 120,
  stops: [{ id: "visited", name: "방문한 장소", address: "대구 중구", latitude: 35.87, longitude: 128.6, visitedAt: now }, { id: "closed", name: "휴무 장소", address: "대구 중구", latitude: 35.871, longitude: 128.6, visitedAt: null }, { id: "next", name: "다음 일정", address: "대구 중구", latitude: 35.875, longitude: 128.6, visitedAt: null }],
  parking: { latitude: 35.869, longitude: 128.6, label: "중앙 주차장", source: "gps", accuracyM: 10, savedAt: now },
  situation: { reason: "closed", detail: "안내문에 휴무", affectedStopId: "closed", remainingMinutes: 120, baseRevision: 1, confirmedAt: now, currentLocation: { latitude: 35.871, longitude: 128.6, source: "gps", stopId: null, accuracyM: 10, capturedAt: now } } });
const sdk = `window.naver={maps:{LatLng:class{constructor(a,b){this.a=a;this.b=b}lat(){return this.a}lng(){return this.b}},Point:class{},LatLngBounds:class{extend(){}},Map:class{constructor(el){this.el=el;el.textContent='지도 SDK 모의 화면 · 검증용'}fitBounds(){}panTo(){}destroy(){}},Marker:class{setPosition(){}setIcon(){}},Polyline:class{},Event:{addListener(){}}}};`;
const proposal = await createTripReplan(trip, 20, { suggest: async () => [{ id: "replacement", sourceId: "kakao:123", name: "대체 카페", address: "대구 중구 검증 주소", latitude: 35.872, longitude: 128.6, visitedAt: null, reason: "가까운 대체 장소", tags: ["실내"] }], leg: async () => ({ minutes: 5, estimated: true }) });

async function setup(mode: "success" | "failure" | "delayed") {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.route("**/api/auth/session", (r) => r.fulfill({ json: null }));
  await page.route("https://oapi.map.naver.com/**", (r) => r.fulfill({ contentType: "application/javascript", body: sdk }));
  await page.route("**/api/trips/replan", async (r) => {
    if (mode === "failure") return r.fulfill({ status: 502, json: { error: "대체 장소를 조회하지 못했습니다." } });
    if (mode === "delayed") await new Promise((resolve) => setTimeout(resolve, 800));
    await r.fulfill({ json: { proposal } }).catch(() => {});
  });
  await page.addInitScript({ content: `if (!sessionStorage.getItem('replan-seed')) { localStorage.setItem('motion.active-trip.v1',${JSON.stringify(JSON.stringify(trip))}); sessionStorage.setItem('replan-seed','1'); }` });
  await page.goto(`${origin}/login`);
  return { page, context };
}
try {
  // 실제 Route Handler의 입력 검증과 직접 복귀 응답. 외부 AI 호출이 필요 없는 짧은 일정.
  const invalid = await fetch(`${origin}/api/trips/replan`, { method: "POST", body: "{" }); assert.equal(invalid.status, 400);
  const noParking = await fetch(`${origin}/api/trips/replan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trip: { ...trip, parking: null }, visitMinutes: 20 }) }); assert.equal(noParking.status, 409);
  const oversized = await fetch(`${origin}/api/trips/replan`, { method: "POST", body: " ".repeat(100001) }); assert.equal(oversized.status, 413);
  const shortTrip = { ...trip, remainingMinutes: 5, parking: { ...trip.parking!, latitude: 35.871, longitude: 128.6 }, situation: { ...trip.situation!, remainingMinutes: 5 } };
  const direct = await fetch(`${origin}/api/trips/replan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trip: shortTrip, visitMinutes: 20 }) });
  assert.equal(direct.status, 200); const body = await direct.json(); assert.equal(body.proposal.remainingStops.length, 0); assert.equal(body.proposal.parking.label, "중앙 주차장");
  console.log("PASS 실제 API 400/409/413 및 직접 복귀 200");

  const { page, context } = await setup("success");
  await page.getByRole("button", { name: "남은 코스 다시 추천", exact: true }).click();
  const preview = page.getByLabel("변경 코스 확인", { exact: true });
  await expect(preview.getByText("제안 코스", { exact: true })).toBeVisible();
  let stored = await page.evaluate(() => JSON.parse(localStorage.getItem("motion.active-trip.v1")!));
  assert.equal(stored.stops[1].name, "휴무 장소");
  await expect(preview.getByText("3. 주차장 복귀 · 중앙 주차장", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "기존 코스 유지", exact: true }).click();
  await expect(preview).toHaveCount(0);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("motion.active-trip.v1")!)), stored);
  await page.getByRole("button", { name: "남은 코스 다시 추천", exact: true }).click();
  await expect(preview.getByText("제안 코스", { exact: true })).toBeVisible();
  await mkdir("test-results", { recursive: true });
  await preview.screenshot({ path: "test-results/trip-replan-preview-mobile.png" });
  await page.getByRole("button", { name: "이 코스로 변경", exact: true }).click();
  const applied = page.getByLabel("적용된 변경 코스", { exact: true });
  await expect(applied.getByText("변경 코스 적용 완료", { exact: true })).toBeVisible();
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem("motion.active-trip.v1")!));
  assert.deepEqual(stored.stops.map((s: { name: string }) => s.name), ["방문한 장소", "대체 카페", "다음 일정"]);
  assert.equal(stored.stops[0].visitedAt, now); assert.equal(stored.parking.label, "중앙 주차장");
  await expect(applied.getByText("3. 주차장 복귀 · 중앙 주차장", { exact: true })).toBeVisible();
  await page.reload();
  await expect(applied.getByText("변경 코스 적용 완료", { exact: true })).toBeVisible();
  await applied.screenshot({ path: "test-results/trip-replan-applied-mobile.png" });
  await context.close();
  console.log("PASS 미수락 원본 유지·거절·수락·방문 보존·목록/지도 일치·복원");

  const failure = await setup("failure");
  await failure.page.getByRole("button", { name: "남은 코스 다시 추천", exact: true }).click();
  await expect(failure.page.getByRole("alert").filter({ hasText: "대체 장소를 조회하지 못" })).toBeVisible();
  assert.equal((await failure.page.evaluate(() => JSON.parse(localStorage.getItem("motion.active-trip.v1")!))).revision, 1);
  await failure.context.close();
  const delayed = await setup("delayed");
  await delayed.page.getByRole("button", { name: "남은 코스 다시 추천", exact: true }).click();
  await delayed.page.getByRole("checkbox", { name: "다음 일정", exact: true }).check();
  await delayed.page.waitForTimeout(1000);
  await expect(delayed.page.getByLabel("변경 코스 확인", { exact: true })).toHaveCount(0);
  const changed = await delayed.page.evaluate(() => JSON.parse(localStorage.getItem("motion.active-trip.v1")!));
  assert.equal(changed.stops[1].name, "휴무 장소"); assert.ok(changed.stops[2].visitedAt);
  await delayed.context.close();
  console.log("PASS API 실패·응답 대기 중 변경 시 오래된 제안 폐기");
} finally { await browser.close(); }
