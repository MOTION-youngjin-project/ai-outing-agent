import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
let tags = ["실내"], exists = true, dbFails = false;
mock.module("../src/lib/prisma", { namedExports: { prisma: {
  user: { findUnique: async () => { if (dbFails) throw Error("DB failure"); return { preferredTags: tags }; } },
  agentRun: { findFirst: async () => exists ? { id: "run" } : null },
} } });
const { readRecommendationCache: read, storeRecommendationCache: store, recommendationCacheKey: key } = await import("../src/lib/services/recommendation-cache");
const history = [{ role: "user" as const, content: "대구 오늘 3시 도보 데이트" }];
const result = { agentRunId: "run", recommendationRouteId: "route", recommendation: { needsMoreInfo: false, message: "course", places: [] } };
// Minimal valid enriched place without network-dependent metadata.
const place = { name: "장소", oneLineDescription: "설명", reason: "이유", category: null, distanceKm: null, placeId: null, latitude: null, longitude: null, travelDistanceM: null, travelDurationMin: null };
const completed = { ...result, recommendation: { ...result.recommendation, places: [place] } };

test("cache lifecycle, changed conditions, ownership checks and bypasses", async () => {
  const now = Date.now();
  const first = await read("1", history, null, null, now);
  store(first.key, completed, now);
  assert.ok((await read("1", history, null, null, now + 1)).result);
  assert.equal((await read("2", history, null, null, now + 1)).result, null);
  for (const changed of ["부산 오늘 3시 도보 데이트", "대구 내일 3시 도보 데이트", "대구 오늘 4시 도보 데이트", "대구 오늘 3시 자동차 데이트", "다른 코스 추천"])
    assert.notEqual(key("1", [{ role: "user", content: changed }], null, null, tags, now), first.key);
  assert.notEqual(key("1", history, { latitude: 35, longitude: 128 }, null, tags, now), first.key);
  tags = ["야외"];
  assert.equal((await read("1", history, null, null, now)).result, null);
  tags = ["실내"]; exists = false;
  assert.equal((await read("1", history, null, null, now)).result, null);
  exists = true; store(first.key, completed, now);
  assert.equal((await read("1", history, null, null, now + 300_000)).result, null);
  store(first.key, { ...completed, recommendation: { ...completed.recommendation, needsMoreInfo: true } }, now);
  assert.equal((await read("1", history, null, null, now)).result, null);
  dbFails = true;
  assert.equal((await read("1", history, null, null, now)).key, null);
  dbFails = false;
  const midnight = Date.parse("2026-09-21T15:00:00Z");
  assert.notEqual(key("1", history, null, null, tags, midnight - 1), key("1", history, null, null, tags, midnight));
});

test("route hit skips generation, affordability and usage charge, retaining NDJSON contract", async () => {
  let calls = 0, gates = 0, charges = 0;
  mock.module("../src/lib/auth", { namedExports: { auth: async () => ({ user: { id: "9", email: null } }) } });
  mock.module("../src/lib/billing/quota", { namedExports: {
    ensureAffordable: async () => { gates++; return { allowed: true, cost: 0 }; },
    recordUsage: async () => { charges++; },
  } });
  mock.module("../src/lib/services/recommendations", { namedExports: {
    createRecommendationRun: async () => { calls++; return completed; },
  } });
  const { POST } = await import("../src/app/api/recommend/route");
  const request = () => new NextRequest("http://localhost/api/recommend", { method: "POST", body: JSON.stringify({ history }) });
  const first = await POST(request());
  assert.equal(first.headers.get("X-Recommendation-Cache"), "miss");
  const original = await first.text();
  const second = await POST(request());
  assert.equal(second.headers.get("X-Recommendation-Cache"), "hit");
  assert.equal(await second.text(), original);
  assert.deepEqual([calls, gates, charges], [1, 1, 1]);
});
