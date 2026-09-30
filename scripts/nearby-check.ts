import assert from "node:assert/strict";
import { searchNearby } from "../src/lib/services/nearby";
import { estimateWalkMinutes, nearbyKindsForCategory } from "../src/lib/nearby";

process.env.KAKAO_API_KEY = "test-only";
let calls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async input => {
  calls++;
  const url = new URL(String(input));
  assert.equal(url.searchParams.get("sort"), "distance");
  assert.equal(url.searchParams.get("radius"), "1000");
  assert.equal(url.searchParams.get("x"), "128.6");
  const doc = (id: string, distance: number, name = "식당", category = "음식점") => ({ id, place_name: name, category_name: category, road_address_name: "대구", address_name: "대구", x: "128.6", y: "35.8", distance: String(distance) });
  const keyword = url.searchParams.get("query");
  if (keyword === "공원") return Response.json({ documents: [doc("park", 400, "달빛공원", "관광명소 > 공원")] });
  if (keyword === "산책로") return Response.json({ documents: [doc("trail", 250, "강변산책로", "관광명소 > 산책로"), doc("park", 400, "달빛공원", "관광명소 > 공원")] });
  return Response.json({ documents: url.pathname.includes("keyword") ? [doc("s", 200, "소품샵", "쇼핑 > 액세서리"), doc("bad", 100, "대형마트", "마트")] : [doc("2", 300), doc("1", 100), doc("1", 100), doc("far", 1500), { invalid: true }] });
};
try {
  const [a, b] = await Promise.all([searchNearby(35.8, 128.6, "food", 1000), searchNearby(35.8, 128.6, "food", 1000)]);
  assert.equal(calls, 1, "동시 요청은 하나로 합쳐야 함");
  assert.deepEqual(a.map(p => p.id), ["1", "2"], "거리순·중복 제거·반경 제한");
  assert.equal(a[0].estimatedWalkMinutes, 2);
  assert.deepEqual(a, b);
  assert.equal((await searchNearby(35.8, 128.6, "shop", 1000)).length, 1);
  assert.deepEqual((await searchNearby(35.8, 128.6, "walk", 1000)).map(p => p.id), ["trail", "park"], "산책 후보 적합도 필터·거리 정렬");
  globalThis.fetch = async () => { calls++; return new Response("failure", { status: 502 }); };
  await assert.rejects(searchNearby(35.8, 128.6, "cafe", 1000));
  await assert.rejects(searchNearby(35.8, 128.6, "cafe", 1000));
  assert.equal(calls, 7, "실패는 캐시하지 않아야 함");
  assert.deepEqual(nearbyKindsForCategory("음식점 > 한식"), ["walk", "cafe"]);
  assert.deepEqual(nearbyKindsForCategory("문화시설 > 미술관"), ["food", "cafe", "shop"]);
  assert.equal(estimateWalkMinutes(801), 11);
  console.log("주변 장소: 검색 조건·거리 정렬·중복·반경·소품 분류·동시 요청·실패 재시도 검사 통과");
} finally { globalThis.fetch = originalFetch; }
