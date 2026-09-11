import "dotenv/config";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { coordinate, parseCoordinateQuery } from "../src/lib/coordinates";
import { guestHash, guestToken, ownerWhere } from "../src/lib/recommendation-owner";
import { resolveSources, safeSourceUrl } from "../src/lib/recommendation-sources";
import { verifyPlace } from "../src/lib/place-verification";
import { buildSharePlanText } from "../src/lib/share-plan";
import { parkingNumber, getDaeguParkingNearby, formatFeeLines } from "../src/lib/tools/parking";
import { occupancyLabel } from "../src/lib/parkingDisplay";
import { readRecommendation, listRecommendations, deleteRecommendation } from "../src/lib/services/recommendation-history";
import { searchPdfGuides } from "../src/lib/tools/pdfGuide";

const database = new URL(process.env.DATABASE_URL!);
assert.ok(["127.0.0.1", "localhost"].includes(database.hostname) && database.pathname.startsWith("/motion_integration_check"), "독립 테스트 DB에서만 실행할 수 있습니다.");
let checks = 0;
function check(name: string, run: () => void) { run(); checks++; console.log(`✓ ${name}`); }
check("좌표 누락·공백·NaN·범위 밖·0,0 거절", () => {
  for (const pair of [[null, 128], ["", 128], [" ", 128], [NaN, 128], [91, 128], [35, 181], [0, 0]]) assert.equal(coordinate(...pair as [unknown, unknown]), null);
  assert.deepEqual(coordinate("35.8", "128.6"), { latitude: 35.8, longitude: 128.6 });
  assert.throws(() => parseCoordinateQuery(new URLSearchParams("latitude=35")));
});
check("주차 0과 누락 구분·거짓 무료 및 혼잡 방지", () => {
  assert.equal(parkingNumber("0"), 0); assert.equal(parkingNumber(""), null); assert.equal(parkingNumber(-1), null);
  assert.equal(occupancyLabel({ capacity: null, remainingSpaces: 0 }), null);
  assert.equal(occupancyLabel({ capacity: 10, remainingSpaces: 11 }), null);
  assert.equal(occupancyLabel({ capacity: 10, remainingSpaces: 0 })?.label, "혼잡");
  assert.equal(formatFeeLines({ gnrlFrstCrgLevyHr: "30" } as Parameters<typeof formatFeeLines>[0]), null);
});
check("실제 검색 출처만 인용·위험 URL 거절", () => {
  const source = { id: "pdf-1", documentTitle: "공식 PDF", page: 2, sourceUrl: "https://tour.daegu.go.kr/guide.pdf" };
  assert.deepEqual(resolveSources(["pdf-1", "invented", "pdf-1"], new Map([[source.id, source]])), [source]);
  assert.equal(safeSourceUrl("javascript:alert(1)"), null);
});
check("장소 불일치 시 AI 영업정보 제거·텍스트 공유에 비공개 URL 없음", () => {
  const place = verifyPlace({ name: "미술관", address: "대구 수성구", operatingHours: "24시간", fee: "무료", oneLineDescription: "전시", reason: "관람" }, []);
  assert.equal(place.operatingHours, undefined); assert.equal(place.fee, undefined);
  const text = buildSharePlanText({ needsMoreInfo: false, message: "계획", places: [place] });
  assert.ok(text.includes("방문 전 확인")); assert.ok(!text.includes("/recommend/"));
});
check("비회원 토큰 검증 및 계정 우선 소유자 조건", () => {
  assert.equal(guestHash("bad"), null);
  const token = guestToken(); assert.equal(token.length, 64); assert.notEqual(guestHash(token), token);
  assert.deepEqual(ownerWhere("12", guestHash(token)), { userId: 12n });
});

const originalFetch = globalThis.fetch;
const savedParkingKey = process.env.DAEGU_PARKING_API_KEY;
process.env.DAEGU_PARKING_API_KEY = "fixture-only";
const parking = (id: string, lat: unknown, capacity: unknown = 10) => ({ prkInfo: { pkltId: id, pkltNm: id, sysgrpyYn: "Y" }, prkFcltInfo: { lat, lot: 128.6, prkNocmprt: capacity }, prkOperInfo: {} });
globalThis.fetch = async input => {
  const url = new URL(String(input));
  return Response.json({ resultCode: "200", data: url.pathname.includes("serviceApply") ? [{ rltmPrkInfo: { totRmndPrkNocmprt: "0" } }] : [parking("far", 36), parking("near", 35.8001), parking("near", 35.8002), parking("invalid", ""), parking("missing-count", 35.81, null)] });
};
const spots = await getDaeguParkingNearby("수성구", { latitude: 35.8, longitude: 128.6 });
check("전체 후보 거리순·중복/좌표 오류 제외·실제 잔여 0 보존", () => {
  assert.deepEqual(spots.map(s => s.id), ["near", "missing-count", "far"]);
  assert.equal(spots[0].remainingSpaces, 0); assert.equal(spots[1].capacity, null);
});
globalThis.fetch = originalFetch;
if (savedParkingKey === undefined) delete process.env.DAEGU_PARKING_API_KEY; else process.env.DAEGU_PARKING_API_KEY = savedParkingKey;

const suffix = randomUUID();
const a = await prisma.user.create({ data: { email: `check-a-${suffix}@example.invalid`, passwordHash: "test-only" } });
const b = await prisma.user.create({ data: { email: `check-b-${suffix}@example.invalid`, passwordHash: "test-only" } });
const ids: string[] = [];
try {
  const snapshot = { needsMoreInfo: false, message: "부분 매칭도 보존", places: [{ name: "미매칭 장소", oneLineDescription: "안내", reason: "조건 일치", placeId: null, sources: [{ id: "pdf-1", documentTitle: "자료", page: 2, sourceUrl: null }] }] };
  const create = async (userId: bigint | null, expiresAt: Date, sessionKeyHash?: string) => {
    const run = await prisma.agentRun.create({ data: { userId, sessionKeyHash, requestMode: "question", status: "partial", routeCount: 1, recommendationJson: snapshot, expiresAt } }); ids.push(run.id); return run;
  };
  const valid = await create(a.id, new Date(Date.now() + 86400000));
  const expired = await create(a.id, new Date(Date.now() - 10000));
  const token = guestToken(); const guest = await create(null, new Date(Date.now() + 86400000), guestHash(token)!);
  assert.equal((await readRecommendation(valid.id, a.id.toString()))?.places?.[0].sources?.[0].page, 2);
  assert.equal(await readRecommendation(valid.id, b.id.toString()), null);
  assert.equal(await readRecommendation(valid.id), null);
  assert.equal(await readRecommendation(expired.id, a.id.toString()), null);
  assert.equal(await readRecommendation(guest.id, null, guestHash(guestToken())), null);
  assert.ok(await readRecommendation(guest.id, null, guestHash(token)));
  assert.equal(await readRecommendation(guest.id, b.id.toString(), guestHash(token)), null);
  assert.deepEqual((await listRecommendations(a.id.toString())).map(r => r.id), [valid.id]);
  console.log("✓ 실제 DB: 본인/타인/비회원/만료 8개 조회 조건"); checks += 8;
  assert.equal(await deleteRecommendation(valid.id, b.id.toString()), false);
  assert.equal(await deleteRecommendation(valid.id, a.id.toString()), true);
  assert.equal(await readRecommendation(valid.id, a.id.toString()), null);
  console.log("✓ 실제 DB: 타인 삭제 거절·본인 삭제·삭제 후 재조회 차단"); checks += 3;
  const guides = await searchPdfGuides("대구 음식점 도시철도 여행");
  assert.ok(guides.length > 0 && guides.every(g => g.sourceId.startsWith("pdf-") && g.page && g.retrievalMode === "keyword_fallback"));
  console.log("✓ 실제 PDF 색인에서 키 없는 검색·페이지 출처 반환"); checks++;

  // 외부 LLM만 고정 응답으로 대체하고 저장 서비스와 DB 트랜잭션은 실제 실행한다.
  mock.module(new URL("../src/lib/agent.ts", import.meta.url).href, { namedExports: { runAgentStream: async () => snapshot } });
  const { createRecommendationRun } = await import("../src/lib/services/recommendations");
  const result = await createRecommendationRun([{ role: "user", content: "검사 질문" }], undefined, null, a.id.toString()); ids.push(result.agentRunId);
  assert.equal((await readRecommendation(result.agentRunId, a.id.toString()))?.places?.length, 1);
  assert.equal((await prisma.agentRun.findUnique({ where: { id: result.agentRunId } }))?.userQuery, "검사 질문");
  const anon = await createRecommendationRun([{ role: "user", content: "저장되면 안 되는 비회원 질문" }], undefined, null, null, guestHash(token)); ids.push(anon.agentRunId);
  const anonRow = await prisma.agentRun.findUnique({ where: { id: anon.agentRunId } });
  assert.equal(anonRow?.userQuery, null); assert.equal(anonRow?.userId, null);
  assert.ok(await readRecommendation(anon.agentRunId, null, guestHash(token)));
  assert.ok(await deleteRecommendation(result.agentRunId, a.id.toString()));
  console.log("✓ 실제 추천 저장: 미매칭 보존·회원 질문 기록·비회원 원문 미저장·연결된 코스 삭제"); checks += 4;
  mock.module(new URL("../src/lib/auth.ts", import.meta.url).href, { namedExports: { auth: async () => null } });
  const { POST } = await import("../src/app/api/recommend/route");
  const { NextRequest } = await import("next/server");
  const invalid = await POST(new NextRequest("http://localhost/api/recommend", { method: "POST", body: "{bad" }));
  assert.equal(invalid.status, 400);
  const response = await POST(new NextRequest("http://localhost/api/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ history: [{ role: "user", content: "스트림 검사" }] }) }));
  const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line));
  const final = events.at(-1);
  assert.equal(final.type, "result"); ids.push(final.result.agentRunId);
  assert.ok(events.some(event => event.type === "resolving_places"));
  assert.ok(response.headers.get("set-cookie")?.includes("HttpOnly"));
  assert.ok(response.headers.get("content-type")?.includes("application/x-ndjson"));
  console.log("✓ NDJSON 실제 라우트: 입력 검증·진행 이벤트·최종 응답·비회원 쿠키"); checks += 4;
} finally {
  mock.restoreAll();
  // 이 실행이 만든 테스트 데이터만 정리한다.
  for (const id of ids) {
    const routes = await prisma.recommendationRoute.findMany({ where: { agentRunId: id }, select: { id: true } });
    await prisma.routePlace.deleteMany({ where: { routeId: { in: routes.map(r => r.id) } } });
    await prisma.recommendationRoute.deleteMany({ where: { agentRunId: id } });
    await prisma.agentRun.deleteMany({ where: { id } });
  }
  await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  await prisma.$disconnect();
}
console.log(`통합 검사 통과: ${checks}개 항목`);
