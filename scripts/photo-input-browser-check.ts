import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const origin = process.env.PHOTO_TEST_ORIGIN ?? "http://localhost:3104";
const photo = { name: "reference.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64") };
let posts = 0;
page.on("request", (r) => { if (r.method() === "POST") posts++; });
try {
  await page.route("**/api/auth/session", (r) => r.fulfill({ json: null }));
  await page.addInitScript({ content: `window.photoUrls={created:[],revoked:[]};const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=(b)=>{const u=create(b);window.photoUrls.created.push(u);return u};URL.revokeObjectURL=(u)=>{window.photoUrls.revoked.push(u);revoke(u)};` });
  await page.goto(`${origin}/photo`);
  const album = page.getByLabel("참고 사진 앨범 파일", { exact: true });
  const camera = page.getByLabel("참고 사진 카메라 파일", { exact: true });
  await expect(camera).toHaveAttribute("capture", "environment");
  await expect(album).not.toHaveAttribute("multiple");
  await album.setInputFiles(photo);
  await expect(page.getByRole("img", { name: "참고 사진 미리보기" })).toBeVisible();
  await expect(page.getByText("reference.png", { exact: true })).toBeVisible();
  const original = await page.getByRole("img", { name: "참고 사진 미리보기" }).getAttribute("src");
  await album.setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("not a picture") });
  await expect(page.getByRole("region", { name: "참고 사진", exact: true }).getByRole("alert")).toContainText("JPEG·PNG·WebP");
  await expect(page.getByRole("img", { name: "참고 사진 미리보기" })).toHaveAttribute("src", original!);
  await album.setInputFiles({ name: "broken.jpg", mimeType: "image/jpeg", buffer: Buffer.from([255, 216, 255, 224, 0, 0]) });
  await expect(page.getByRole("region", { name: "참고 사진", exact: true }).getByRole("alert")).toContainText("사진을 읽을 수 없습니다");
  await expect(page.getByRole("img", { name: "참고 사진 미리보기" })).toHaveAttribute("src", original!);
  await album.setInputFiles({ name: "large.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(page.getByRole("region", { name: "참고 사진", exact: true }).getByRole("alert")).toContainText("10MB 이하");
  await album.setInputFiles({ ...photo, name: "empty.png", buffer: Buffer.alloc(0) });
  await expect(page.getByRole("region", { name: "참고 사진", exact: true }).getByRole("alert")).toContainText("빈 파일");
  await camera.setInputFiles({ ...photo, name: "camera.png" });
  await expect(page.getByText("camera.png", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "사진 삭제", exact: true }).click();
  await expect(page.getByRole("img", { name: "참고 사진 미리보기" })).toHaveCount(0);
  await album.setInputFiles(photo);
  await expect(page.getByRole("img", { name: "참고 사진 미리보기" })).toBeVisible();
  const metrics = await page.evaluate("window.photoUrls");
  assert.ok(metrics.revoked.includes(original));
  const stored = await page.evaluate(() => Object.keys(localStorage));
  assert.deepEqual(stored, []);
  assert.equal(posts, 0, "사진 입력 중 서버로 POST하지 않음");
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/photo-input-mobile.png", fullPage: true });
  await page.reload();
  await expect(page.getByRole("img", { name: "참고 사진 미리보기" })).toHaveCount(0);
  console.log("PASS 카메라/앨범 입력·교체·삭제·동일 파일 재선택·위장/손상/용량/빈 파일·URL 해제·미전송·미저장·새로고침 삭제");
} finally { await browser.close(); }


