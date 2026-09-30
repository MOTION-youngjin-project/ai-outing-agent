import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const trip = { version: 1, id: "situation-trip", sourceRunId: "run", title: "상황 입력 검증 여행", revision: 0, status: "active", startedAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z", transportMode: "walk", remainingMinutes: 180, stops: [{ id: "a", name: "방문한 장소", address: null, latitude: 35.87, longitude: 128.6, visitedAt: "2026-09-16T00:00:00.000Z" }, { id: "b", name: "남은 장소", address: null, latitude: 35.88, longitude: 128.61, visitedAt: null }] };
try {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: null }));
  await page.addInitScript({ content: `(() => {
    if (!sessionStorage.getItem('situation-seeded')) {
      localStorage.setItem('motion.active-trip.v1', ${JSON.stringify(JSON.stringify(trip))});
      sessionStorage.setItem('situation-seeded','1');
    }
    Object.defineProperty(navigator, 'geolocation', {configurable:true, value:{getCurrentPosition:(success,failure)=>failure({code:1})}});
  })();` });
  await page.goto(`${process.env.SITUATION_TEST_ORIGIN ?? "http://localhost:3104"}/login`);
  await page.getByLabel("현장 사진 앨범 파일", { exact: true }).setInputFiles({ name: "scene.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64") });
  await expect(page.getByRole("img", { name: "현장 사진 미리보기" })).toBeVisible();
  await page.getByRole("button", { name: "현장 상황 입력", exact: true }).click();
  const form = page.getByRole("form", { name: "현장 상황 입력" });
  await form.getByRole("button", { name: "휴무예요" }).click();
  await expect(form.getByLabel("변경 대상 장소").getByRole("option", { name: "방문한 장소" })).toHaveCount(0);
  await form.getByRole("button", { name: "현재 위치 확인", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("위치 권한이 거부");
  await expect(form.getByRole("button", { name: "상황 저장", exact: true })).toBeDisabled();
  await form.getByLabel("또는 지금 있는 코스 장소").selectOption("a");
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "상황 저장", exact: true }).click();
  await expect(form).toBeVisible(); // 휴무 대상 누락: 브라우저 필수 입력 검증
  await form.getByLabel("변경 대상 장소").selectOption("b");
  await form.getByLabel("이번 일정의 남은 시간(분)").fill("60");
  await form.getByLabel("상황 설명", { exact: false }).fill("입구에 오늘 휴무라고 안내되어 있어요.");
  await expect(form.getByRole("checkbox")).not.toBeChecked();
  await form.getByRole("checkbox").check();
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/trip-situation-mobile.png", fullPage: true });
  await form.getByRole("button", { name: "상황 저장", exact: true }).click();
  await expect(page.getByText("저장한 상황: 휴무예요", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("img", { name: "현장 사진 미리보기" })).toHaveCount(0);
  await expect(page.getByText("저장한 상황: 휴무예요", { exact: true })).toBeVisible();
  await expect(page.getByText("대상: 남은 장소 · 남은 시간 60분", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "현장 상황 수정" }).click();
  await form.getByRole("button", { name: "직접 입력", exact: true }).click();
  await form.getByLabel("상황 설명", { exact: false }).fill(" ");
  await form.getByLabel("또는 지금 있는 코스 장소").selectOption("a");
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "상황 저장", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("변경하고 싶은 상황");
  await form.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.getByText("저장한 상황: 휴무예요", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "남은 장소", exact: true }).check();
  await expect(page.getByText("저장한 상황: 휴무예요", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "현장 상황 입력", exact: true }).click();
  await page.evaluate(`Object.defineProperty(navigator, 'geolocation', {configurable:true, value:{getCurrentPosition:(success)=>success({coords:{latitude:35.89,longitude:128.62,accuracy:15}})}})`);
  await form.getByRole("button", { name: "쉬고 싶어요" }).click();
  await form.getByRole("button", { name: "현재 위치 확인", exact: true }).click();
  await expect(form.getByText("현재 위치: 35.890000, 128.620000", { exact: false })).toBeVisible();
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "상황 저장", exact: true }).click();
  await expect(page.getByText("저장한 상황: 쉬고 싶어요", { exact: true })).toBeVisible();
  console.log("PASS 대상 필수·방문 장소 제외·GPS 성공/거부·장소 직접 선택·확인 재설정·저장 복원·빈 설명·취소·조건 변경 무효화");
} finally { await browser.close(); }
