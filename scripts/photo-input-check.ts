import assert from "node:assert/strict";
import { test } from "node:test";
import { detectPhotoType, validatePhotoSize, validatePhotoDimensions, MAX_PHOTO_BYTES } from "../src/lib/photo-input";

test("확장자 대신 실제 JPEG/PNG/WebP 헤더 확인", () => {
  assert.equal(detectPhotoType(new Uint8Array([255,216,255,224])), "image/jpeg");
  assert.equal(detectPhotoType(new Uint8Array([137,80,78,71,13,10,26,10])), "image/png");
  assert.equal(detectPhotoType(new TextEncoder().encode("RIFFxxxxWEBP")), "image/webp");
  for (const value of ["<svg></svg>", "plain text", "RIFF", "ftypheic"]) assert.equal(detectPhotoType(new TextEncoder().encode(value)), null);
  assert.equal(detectPhotoType(new Uint8Array()), null);
});
test("10MB 경계와 빈 파일 검사", () => {
  validatePhotoSize(MAX_PHOTO_BYTES);
  for (const value of [0, -1, NaN, Infinity, MAX_PHOTO_BYTES + 1]) assert.throws(() => validatePhotoSize(value));
});
test("해상도·가로세로 경계 검사", () => {
  validatePhotoDimensions(8000, 5000);
  for (const [width, height] of [[0, 1], [1, NaN], [1.2, 10], [12001, 1], [1, 12001], [8001, 5000]]) assert.throws(() => validatePhotoDimensions(width, height));
});
