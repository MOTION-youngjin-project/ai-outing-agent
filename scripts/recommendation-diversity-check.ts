import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
import { recentPlaceNames, removeRepeatedPlaces } from "../src/lib/recommendation-diversity";
import { followUpSuggestion } from "../src/lib/follow-up-suggestion";

const place = (name: string) => ({ name, oneLineDescription: "설명", reason: "조건", suggestedRoute: "고양이 카페 → 공원" });
const snapshots = [{ places: [place("고양이 카페"), place("공원")] }];
test("diversity removes recent names and within-result duplicates without a retry", () => {
  const excluded = recentPlaceNames(snapshots, [{ role: "user", content: "다른 데이트 추천" }]);
  const result = removeRepeatedPlaces({ needsMoreInfo: false, message: "고양이 카페", places: [place("고양이카페"), place("새 장소"), place("새 장소")] }, excluded);
  assert.deepEqual(result.places?.map(p => p.name), ["새 장소"]);
  assert.ok(!JSON.stringify(result).includes("고양이"));
  const empty = removeRepeatedPlaces({ needsMoreInfo: false, message: "old", places: [place("공원")] }, excluded);
  assert.equal(empty.needsMoreInfo, true);
  assert.equal(empty.places, undefined);
});
test("explicit requested place/revisit is allowed; bad snapshots ignored and list bounded", () => {
  assert.deepEqual(recentPlaceNames(snapshots, [{ role: "user", content: "같은 곳 다시 방문" }]), []);
  assert.deepEqual(recentPlaceNames(snapshots, [{ role: "user", content: "공원 가고 싶어" }]), ["고양이 카페"]);
  assert.deepEqual(recentPlaceNames([null, {}, { places: [null, { name: 1 }] }], []), []);
  assert.equal(recentPlaceNames([{ places: Array.from({ length: 30 }, (_, i) => place(`장소${i}`)) }], []).length, 20);
});
test("negative revisit wording must keep repeat exclusions", () => {
  for (const content of ["같은 곳 말고 다른 곳", "다시 방문하지 않을래", "재방문 싫어"])
    assert.equal(recentPlaceNames(snapshots, [{ role: "user", content }]).length, 2);
});
test("suggestions use local rules and avoid exact previously selected prompts", () => {
  assert.equal(followUpSuggestion([]), "");
  const history = [{ role: "assistant" as const, content: "추천" }];
  const first = followUpSuggestion(history);
  assert.ok(first);
  assert.notEqual(followUpSuggestion([...history, { role: "user", content: first }]), first);
});
test("suggest API uses no model and rejects invalid body", async () => {
  mock.module("../src/lib/auth", { namedExports: { auth: async () => ({ user: { id: "1" } }) } });
  mock.module("../src/lib/billing/quota", { namedExports: { loadBalance: async () => ({ freeRemaining: 1, balanceKrw: 0, hasBillingKey: false }) } });
  mock.module("../src/lib/agent", { namedExports: { suggestNextMessage: () => { throw Error("model must never be invoked"); } } });
  const { POST } = await import("../src/app/api/suggest/route");
  const request = (body: unknown) => new NextRequest("http://localhost/api/suggest", { method: "POST", body: JSON.stringify(body) });
  assert.equal((await POST(request(null))).status, 400);
  assert.equal((await POST(request({ history: [{ role: "bad", content: "x" }] }))).status, 400);
  const response = await POST(request({ history: [{ role: "assistant", content: "추천 완료" }] }));
  assert.ok((await response.json()).suggestion);
});
