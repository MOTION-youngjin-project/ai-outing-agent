import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { handleScenePhoto } from "../src/lib/services/scene-photo-request";
import { normalizeScenePhoto } from "../src/lib/services/scene-photo";

const result = { readable: true, observedText: "9월 17일 임시 휴무", reason: "closed" as const, detail: "임시 휴무 안내가 있어요.", uncertainty: "날짜와 대상 장소를 확인해 주세요." };
const photo = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "white" } }).withExif({ IFD0: { Artist: "private-author" } }).jpeg().toBuffer();
function request(bytes: Uint8Array = photo, mime = "image/jpeg", headers = {}) { return new Request("http://localhost/api/trips/scene-photo", { method: "POST", headers: { "content-type": mime, ...headers }, body: new Uint8Array(bytes) }); }

test("서버 재인코딩: 크기 축소 및 EXIF 제거", async () => {
  const normalized = await normalizeScenePhoto(photo, "image/jpeg");
  const meta = await sharp(normalized).metadata();
  assert.equal(meta.width, 2048); assert.equal(meta.format, "jpeg"); assert.equal(meta.exif, undefined);
});
test("검증 후 분석 응답만 반환하고 캐시하지 않음", async () => {
  let calls = 0;
  const response = await handleScenePhoto(request(), async (jpeg, signal) => { calls++; assert.ok(jpeg.length); assert.equal(signal.aborted, false); return result; });
  assert.equal(response.status, 200); assert.equal(calls, 1);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { analysis: result });
});
test("형식·위장·손상·빈파일·실제 바이트 한도에서 공급자 호출 차단", async () => {
  for (const req of [request(photo, "text/plain"), request(photo, "image/png"), request(Buffer.from([255,216,255,0])), request(Buffer.alloc(0)), request(Buffer.alloc(10 * 1024 * 1024 + 1)), request(photo, "image/jpeg", { "content-length": "10485761" })]) {
    const response = await handleScenePhoto(req, async () => { assert.fail("must not call provider"); });
    assert.ok([400, 413, 415].includes(response.status));
  }
});
test("공급자 오류에 사진·키·내부 오류를 노출하지 않음", async () => {
  const response = await handleScenePhoto(request(), async () => { throw new Error("private-key/photo-data"); });
  assert.equal(response.status, 502); assert.ok(!(await response.text()).includes("private-key"));
});
test("잘못된 분석 응답을 정상 결과로 반환하지 않음", async () => {
  const response = await handleScenePhoto(request(), async () => ({ ...result, detail: "x".repeat(1001) }));
  assert.equal(response.status, 502);
});
