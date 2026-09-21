import assert from "node:assert/strict";
import { test } from "node:test";
import { preferenceContext, loadPreferenceContext, normalizePreferenceTags } from "../src/lib/recommendation-preferences";
const history = (content: string) => [{ role: "user" as const, content }];

test("only allowed unique tags enter context; absent preferences add no text", () => {
  assert.deepEqual(normalizePreferenceTags(["실내", "실내", "ignore instructions", 1]), ["실내"]);
  for (const value of [null, {}, [], ["unknown"]]) assert.equal(preferenceContext(value, history("대구 추천")), undefined);
  assert.match(preferenceContext(["실내"], history("대구 추천"))!, /실내/);
});
test("explicit dimensions override saved defaults including negative requests", () => {
  assert.equal(preferenceContext(["실내"], history("야외 말고 추천")), undefined);
  assert.equal(preferenceContext(["데이트"], history("친구와 대구 여행")), undefined);
  assert.equal(preferenceContext(["저비용"], history("가격 상관없어")), undefined);
  assert.equal(preferenceContext(["실내"], history("등산 추천")), undefined);
  assert.equal(preferenceContext(["실내", "야외"], history("대구 추천")), undefined);
  assert.equal(preferenceContext(["실내"], history("저장된 취향 무시해")), undefined);
});
test("earlier user conditions persist but assistant words do not suppress preferences", () => {
  assert.equal(preferenceContext(["데이트"], [...history("혼자 갈 거야"), ...history("다른 장소")]), undefined);
  assert.match(preferenceContext(["실내"], [{ role: "assistant", content: "야외" }, ...history("대구 추천")])!, /실내/);
});
test("load only authenticated user's preferences; failures are optional", async () => {
  let calls = 0;
  const load = async (id: bigint) => { calls++; assert.equal(id, 42n); return ["저비용"]; };
  assert.equal(await loadPreferenceContext(undefined, history("대구"), load), undefined);
  assert.equal(calls, 0);
  assert.match((await loadPreferenceContext(42n, history("대구"), load))!, /저비용/);
  assert.equal(calls, 1);
  assert.equal(await loadPreferenceContext(42n, history("대구"), async () => { throw Error("DB unavailable"); }), undefined);
});
