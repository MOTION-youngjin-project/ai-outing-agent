import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// 지도/GPS 응답만 대체하고 실제 앱의 모바일 화면과 localStorage를 검증한다.
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge" });
const origin = process.env.PARKING_TEST_ORIGIN ?? "http://localhost:3104";
const trip = { version: 1, id: "browser-trip", sourceRunId: "test-run", title: "주차 위치 검증 여행", revision: 0, status: "active", startedAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z", transportMode: "car", remainingMinutes: 180, stops: [{ id: "a", name: "검증용 장소", address: null, latitude: 35.8714, longitude: 128.6014, visitedAt: null }] };
const sdk = `window.naver={maps:{LatLng:class{constructor(lat,lng){this.a=lat;this.b=lng}lat(){return this.a}lng(){return this.b}},Map:class{constructor(el,options){this.el=el;this.center=options.center;const b=document.createElement('button');b.textContent='검증용 지도 이동';b.onclick=()=>{this.center=new window.naver.maps.LatLng(35.88,128.61)};el.append(b)}getCenter(){return this.center}panTo(p){this.center=p}destroy(){this.el.replaceChildren()}}}};`;

async function setup(gps: "success" | "denied" | "timeout", mapFailure = false) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("Browser error:", error.message));
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: null }));
  await page.route("https://oapi.map.naver.com/**", (route) => mapFailure ? route.abort() : route.fulfill({ contentType: "application/javascript", body: sdk }));
  await page.addInitScript({ content: `(() => {
    const trip = ${JSON.stringify(trip)};
    const gps = ${JSON.stringify(gps)};
    if (!sessionStorage.getItem("parking-test-seeded")) {
      localStorage.setItem("motion.active-trip.v1", JSON.stringify(trip));
      sessionStorage.setItem("parking-test-seeded", "1");
    }
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (success, failure) => {
      if (gps === "success") success({ coords: { latitude: 35.87, longitude: 128.60, accuracy: 45 } });
      else failure({ code: gps === "denied" ? 1 : 3 });
    } } });
  })();` });
  await page.goto(`${origin}/login`);
  await page.getByRole("button", { name: "여기에 주차했어요" }).click();
  return { page, context };
}

try {
  await mkdir("test-results", { recursive: true });
  const { page, context } = await setup("success");
  await page.getByRole("button", { name: "현재 위치 가져오기" }).click();
  await expect(page.getByText("위치 정확도: 약 45m.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "주차 위치 저장", exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: "선택한 위치가 주차한 곳인지 확인했습니다." }).check();
  await page.getByRole("button", { name: "주차 위치 저장", exact: true }).click();
  await page.reload();
  await expect(page.getByText("35.870000, 128.600000", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "주차 위치 수정" }).click();
  await page.getByRole("button", { name: "검증용 지도 이동" }).click();
  await page.getByRole("button", { name: "지도 중앙 선택" }).click();
  await page.getByRole("textbox", { name: "주차 위치 이름" }).fill("동문 주차장");
  await page.getByRole("checkbox", { name: "선택한 위치가 주차한 곳인지 확인했습니다." }).check();
  await page.screenshot({ path: "test-results/parking-location-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "주차 위치 저장", exact: true }).click();
  await expect(page.getByText("35.880000, 128.610000", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "주차 위치 수정" }).click();
  await page.getByRole("textbox", { name: "주차 위치 이름" }).fill("취소할 이름");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.getByText("동문 주차장", { exact: true })).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "주차 위치 삭제" }).click();
  await page.reload();
  await expect(page.getByText("저장된 주차 위치가 없습니다.")).toBeVisible();
  console.log("PASS GPS 확인·저장·복원·지도 보정·취소·삭제");
  await context.close();

  for (const gps of ["denied", "timeout"] as const) {
    const { page, context } = await setup(gps);
    await page.getByRole("button", { name: "현재 위치 가져오기" }).click();
    await expect(page.getByRole("alert").filter({ hasText: gps === "denied" ? "권한이 거부" : "시간이 초과" })).toBeVisible();
    await expect(page.getByRole("button", { name: "주차 위치 저장", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "검증용 지도 이동" }).click();
    await page.getByRole("button", { name: "지도 중앙 선택" }).click();
    await page.getByRole("checkbox", { name: "선택한 위치가 주차한 곳인지 확인했습니다." }).check();
    await page.getByRole("button", { name: "주차 위치 저장", exact: true }).click();
    await expect(page.getByText("35.880000, 128.610000", { exact: true })).toBeVisible();
    console.log(`PASS ${gps}: 지도 직접 선택으로 저장`);
    await context.close();
  }
  const failed = await setup("success", true);
  await expect(failed.page.getByText("지도를 불러오지 못했습니다.", { exact: false })).toBeVisible();
  await failed.page.getByRole("button", { name: "현재 위치 가져오기" }).click();
  await failed.page.getByRole("checkbox", { name: "선택한 위치가 주차한 곳인지 확인했습니다." }).check();
  await failed.page.getByRole("button", { name: "주차 위치 저장", exact: true }).click();
  await expect(failed.page.getByText("35.870000, 128.600000", { exact: true })).toBeVisible();
  console.log("PASS 지도 실패 시 GPS 저장");
  await failed.context.close();
} finally { await browser.close(); }
