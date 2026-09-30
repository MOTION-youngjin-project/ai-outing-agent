import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
try {
  await page.route("**/api/auth/session", (r) => r.fulfill({ json: null }));
  await page.goto("http://localhost:3104/photo");
  const catalog = page.getByRole("region", { name: "대구 촬영 장소" });
  await expect(catalog.locator("details")).toHaveCount(6);
  await catalog.locator("summary").filter({ hasText: "수성못" }).click();
  await expect(catalog.getByText("일몰 전 · 일몰 후", { exact: false })).toBeVisible();
  await catalog.locator("summary").filter({ hasText: "대구미술관" }).click();
  await expect(catalog.getByText("입장 마감은 종료 1시간 전", { exact: false })).toBeVisible();
  await expect(catalog.getByRole("link", { name: "대구미술관 관람시간 및 요금" })).toHaveAttribute("href", "https://daeguartmuseum.or.kr/index.do?menu_id=00000743");
  await expect(page.getByLabel("참고 사진 앨범 파일")).toBeAttached();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/photo-place-catalog-mobile.png", fullPage: true });
  console.log("PASS 촬영 장소 6곳·상세 펼침·운영 안내·공식 출처·사진 입력 공존·모바일 가로 넘침 없음");
} finally { await browser.close(); }
