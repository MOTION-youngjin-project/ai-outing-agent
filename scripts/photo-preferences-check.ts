import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { photoPreferencesSchema, photoTasteAnalysisSchema } from "../src/lib/photo-preferences";
import { usePhotoPreferences } from "../src/lib/photo-preferences-store";
import { handlePhotoAnalysis } from "../src/lib/services/scene-photo-request";

const analysis = { readable: true, tags: ["노을"], background: "하늘", mood: "따뜻한 색조", composition: "역광 인물", uncertainty: "사용자 확인이 필요합니다." };
const photo = await sharp({ create: { width: 32, height: 32, channels: 3, background: "white" } }).jpeg().toBuffer();
const request = () => new Request("http://localhost/api/photo-preferences/analyze", { method: "POST", headers: { "content-type": "image/jpeg" }, body: new Uint8Array(photo) });
test("태그·중요 요소·설명 검증 및 중복 제거", () => {
  assert.equal(photoPreferencesSchema.safeParse({ tags: [], focus: "overall", note: "" }).success, false);
  assert.equal(photoPreferencesSchema.safeParse({ tags: ["임의태그"], focus: "overall", note: "" }).success, false);
  assert.equal(photoPreferencesSchema.safeParse({ tags: ["노을"], focus: "invalid", note: "" }).success, false);
  assert.equal(photoPreferencesSchema.safeParse({ tags: ["노을"], focus: "overall", note: "x".repeat(501) }).success, false);
  assert.deepEqual(photoPreferencesSchema.parse({ tags: ["노을", "노을"], focus: "background", note: " 배경 선호 " }), { tags: ["노을"], focus: "background", note: "배경 선호" });
});
test("확정 텍스트만 보관하고 초기화·잘못된 확정 거부", () => {
  usePhotoPreferences.getState().clear();
  assert.equal(usePhotoPreferences.getState().confirmed, null);
  usePhotoPreferences.getState().confirm({ tags: ["노을"], focus: "background", note: "색감보다 배경" });
  assert.equal(usePhotoPreferences.getState().confirmed?.note, "색감보다 배경");
  assert.throws(() => usePhotoPreferences.getState().confirm({ tags: [], focus: "overall", note: "" }));
  assert.equal(usePhotoPreferences.getState().confirmed?.tags[0], "노을");
  usePhotoPreferences.getState().clear();
  assert.equal(usePhotoPreferences.getState().confirmed, null);
});
test("취향 분석 API 구조와 잘못된 태그 응답 차단", async () => {
  const good = await handlePhotoAnalysis(request(), async () => analysis, { parse: (value) => photoTasteAnalysisSchema.parse(value) });
  assert.equal(good.status, 200); assert.deepEqual(await good.json(), { analysis });
  assert.equal(good.headers.get("cache-control"), "private, no-store");
  const bad = await handlePhotoAnalysis(request(), async () => ({ ...analysis, tags: ["신원추론"] }), { parse: (value) => photoTasteAnalysisSchema.parse(value) });
  assert.equal(bad.status, 502);
});
