import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
import { acquireRecommendationRequest, recommendationRequestKey } from "../src/lib/recommendation-request-lock";

test("keys isolate users, conversation, coordinates and history; old release cannot unlock new work", () => {
  const history = [{ role: "user", content: "대구" }];
  const key = recommendationRequestKey("1", history, null, null);
  for (const other of [recommendationRequestKey("2", history, null, null), recommendationRequestKey("1", history, null, "other"), recommendationRequestKey("1", history, { latitude: 35, longitude: 128 }, null), recommendationRequestKey("1", [{ role: "user", content: "부산" }], null, null)]) assert.notEqual(key, other);
  const first = acquireRecommendationRequest(key);
  assert.ok(first.acquired);
  assert.equal(acquireRecommendationRequest(key).acquired, false);
  first.release();
  const second = acquireRecommendationRequest(key);
  assert.ok(second.acquired);
  first.release();
  assert.equal(acquireRecommendationRequest(key).acquired, false);
  second.release();
});

test("route blocks concurrent duplicate before billing and releases on completion, denial and failure", async () => {
  let calls = 0, gates = 0, charges = 0;
  let allowed = true, fail = false;
  let resolve!: () => void;
  let gate = new Promise<void>(r => { resolve = r; });
  mock.module("../src/lib/services/recommendation-cache", { namedExports: {
    readRecommendationCache: async () => ({ key: null, result: null }), storeRecommendationCache: () => {},
  } });
  mock.module("../src/lib/auth", { namedExports: { auth: async () => ({ user: { id: "1", email: null } }) } });
  mock.module("../src/lib/billing/quota", { namedExports: {
    ensureAffordable: async () => { gates++; return allowed ? { allowed: true, cost: 0 } : { allowed: false, reason: "no_billing_key" }; },
    recordUsage: async () => { charges++; },
  } });
  mock.module("../src/lib/services/recommendations", { namedExports: {
    createRecommendationRun: async () => { calls++; await gate; if (fail) throw Error("expected test failure"); return { agentRunId: "test", recommendation: { places: [{ name: "test" }] } }; },
  } });
  const { POST } = await import("../src/app/api/recommend/route");
  const request = () => new NextRequest("http://localhost/api/recommend", { method: "POST", body: JSON.stringify({ history: [{ role: "user", content: "대구" }] }) });
  const first = await POST(request());
  assert.equal((await POST(request())).status, 409);
  assert.equal(calls, 1); assert.equal(gates, 1);
  resolve(); await first.text(); assert.equal(charges, 1);
  gate = Promise.resolve();
  allowed = false;
  assert.equal((await POST(request())).status, 402);
  assert.equal((await POST(request())).status, 402);
  allowed = true; fail = true;
  assert.match(await (await POST(request())).text(), /expected test failure/);
  fail = false;
  assert.match(await (await POST(request())).text(), /"result"/);
  assert.equal(charges, 2);
  mock.restoreAll();
});
