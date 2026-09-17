import assert from "node:assert/strict";
import { mock } from "node:test";
import { activeTripSchema } from "../src/lib/active-trip";
import { createTripReplan } from "../src/lib/services/trip-replanning";

// 실제 공급자 연결 코드가 AI 출력→좌표 매칭→경로 응답을 올바르게 변환하는지 검사.
// 모든 네트워크는 이 프로세스의 fetch로 대체한다. 실제 DB/API에 접근하지 않는다.
process.env.DATABASE_URL = "mysql://validation:validation@127.0.0.1:3306/validation";
process.env.KAKAO_API_KEY = "test";
process.env.TMAP_APP_KEY = "test";
let prompt = "";
mock.module(new URL("../src/lib/agent.ts", import.meta.url).href, { namedExports: { runAgent: async (history: { content: string }[]) => {
  prompt = history[0].content;
  return { needsMoreInfo: false, message: "대체", places: [{ name: "검증 카페", address: "대구 중구 테스트로 1", reason: "가까운 실내 휴식", tags: ["실내"] }] };
} } });
let routeFailure = false;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.startsWith("https://dapi.kakao.com/")) return Response.json({ documents: [{ id: "123", place_name: "검증 카페", road_address_name: "대구 중구 테스트로 1", address_name: "대구 중구 테스트동 1", category_name: "음식점 > 카페", x: "128.6", y: "35.872", phone: "", place_url: "https://place.map.kakao.com/123" }] });
  if (url.startsWith("https://apis.openapi.sk.com/")) return routeFailure ? new Response("", { status: 503 }) : Response.json({ features: [{ geometry: { type: "Point", coordinates: [128.6, 35.872] }, properties: { totalDistance: 250, totalTime: 300 } }] });
  if (url.startsWith("https://api.transitous.org/")) return routeFailure ? new Response("", { status: 503 }) : Response.json({ itineraries: [{ duration: 600, transfers: 0, legs: [{ mode: "BUS", from: { name: "A" }, to: { name: "B" } }] }] });
  throw new Error(`예상하지 않은 네트워크 요청: ${url.split("?")[0]}`);
};
try {
  const { tripReplanProviders: providers } = await import("../src/lib/services/trip-replan-providers");
  const now = new Date().toISOString();
  const trip = activeTripSchema.parse({ version: 1, id: "p", sourceRunId: "run", title: "친구 사진 여행", revision: 1, status: "active", startedAt: now, updatedAt: now, transportMode: "walk", remainingMinutes: 90, photoPreferences: ["골목 배경"],
    stops: [{ id: "old", name: "휴무 전시관", address: "대구", latitude: 35.871, longitude: 128.6, visitedAt: null }],
    parking: { latitude: 35.87, longitude: 128.6, label: "주차장", savedAt: now, source: "gps", accuracyM: 10 },
    situation: { baseRevision: 1, confirmedAt: now, reason: "closed", detail: "휴무여서 앉아서 쉬고 싶어요", affectedStopId: "old", remainingMinutes: 90, currentLocation: { latitude: 35.871, longitude: 128.6, source: "gps", stopId: null, accuracyM: 10, capturedAt: now } } });
  const candidates = await providers.suggest(trip);
  assert.equal(candidates.length, 1); assert.equal(candidates[0].sourceId, "kakao:123"); assert.equal(candidates[0].latitude, 35.872);
  assert.match(prompt, /골목 배경/); assert.match(prompt, /앉아서 쉬고/);
  const proposal = await createTripReplan(trip, 20, providers);
  assert.equal(proposal.remainingStops[0].name, "검증 카페"); assert.equal(proposal.travelMinutes, 10); assert.equal(proposal.estimatedMinutes, 30);
  const from = { latitude: 35.87, longitude: 128.6 }, to = { latitude: 35.88, longitude: 128.6 };
  assert.deepEqual(await providers.leg(from, to, "public_transit"), { minutes: 10, estimated: false });
  routeFailure = true;
  assert.equal((await providers.leg(from, to, "walk"))?.estimated, true);
  assert.equal(await providers.leg(from, { latitude: 35.95, longitude: 128.6 }, "public_transit"), null);
  console.log("PASS AI 조건 전달·카카오 좌표 매칭·Tmap 이동/복귀·대중교통·조회 실패 대체 정책");
} finally { globalThis.fetch = originalFetch; mock.restoreAll(); }
