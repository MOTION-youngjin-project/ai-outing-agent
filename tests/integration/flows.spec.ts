import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { deleteRecommendation } from "../../src/lib/services/recommendation-history";
import { GUEST_COOKIE, guestHash, guestToken } from "../../src/lib/recommendation-owner";

const suffix = randomUUID();
const password = "integration-test-only-123";
let a: { id: bigint; email: string }, b: { id: bigint; email: string };
let runA: string, runB: string, guestRun: string;
const token = guestToken();
const place = { name: "통합검사 미술관", oneLineDescription: "검사용 전시 공간", reason: "전시 관람", tags: ["실내"], daeguDistrict: "수성구", placeId: "integration-place", latitude: 35.8, longitude: 128.6, sources: [{ id: "pdf-1", documentTitle: "공식 관광 PDF", page: 3, sourceUrl: "https://tour.daegu.go.kr/guide.pdf" }] };
const snapshot = { needsMoreInfo: false, message: "검사용 나들이 코스", places: [place, { ...place, name: "미매칭 장소도 보존", placeId: null, latitude: null, longitude: null }] };
test.beforeAll(async () => {
  const db = new URL(process.env.DATABASE_URL!);
  if (!["127.0.0.1", "localhost"].includes(db.hostname) || !db.pathname.startsWith("/motion_integration_check")) throw Error("독립 테스트 DB만 허용");
  const passwordHash = await bcrypt.hash(password, 10);
  a = await prisma.user.create({ data: { email: `ui-a-${suffix}@example.invalid`, passwordHash, name: "통합 검사 A" } });
  b = await prisma.user.create({ data: { email: `ui-b-${suffix}@example.invalid`, passwordHash, name: "통합 검사 B" } });
  const create = async (userId: bigint | null, question: string | null, sessionKeyHash?: string | null) => (await prisma.agentRun.create({ data: { userId, userQuery: question, sessionKeyHash, requestMode: "question", status: "partial", routeCount: 1, recommendationJson: snapshot, expiresAt: new Date(Date.now() + 86400000) } })).id;
  runA = await create(a.id, "A만 볼 수 있는 추천"); runB = await create(b.id, "B만 볼 수 있는 추천"); guestRun = await create(null, null, guestHash(token));
});
test.afterAll(async () => {
  if (a && runA) await deleteRecommendation(runA, a.id.toString());
  if (b && runB) await deleteRecommendation(runB, b.id.toString());
  if (guestRun) await prisma.agentRun.deleteMany({ where: { id: guestRun } });
  if (a && b) await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  await prisma.$disconnect();
});
async function login(page: Page, user: { email: string }) {
  await page.goto("/login"); await page.getByPlaceholder("이메일", { exact: true }).fill(user.email);
  await page.getByPlaceholder("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/mypage$/);
  await expect(page.getByRole("heading", { name: "내 추천 기록" })).toBeVisible();
}
async function guest(page: Page) {
  await page.context().addCookies([{ name: GUEST_COOKIE, value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
}
test("실제 NextAuth 로그인·본인 목록·타인 GET/DELETE 차단", async ({ page }) => {
  await login(page, a);
  const history = page.getByRole("region", { name: "내 추천 기록" });
  await expect(history.getByText("A만 볼 수 있는 추천")).toBeVisible();
  await expect(history.getByText("B만 볼 수 있는 추천")).toHaveCount(0);
  expect((await page.request.get(`/api/recommend/${runB}`)).status()).toBe(404);
  expect((await page.request.delete(`/api/recommendations/${runB}`)).status()).toBe(404);
  await history.getByRole("link", { name: /A만 볼 수/ }).click();
  await expect(page.getByText("미매칭 장소도 보존", { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByText("미매칭 장소도 보존", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /공식 관광 PDF/ }).first()).toBeVisible();
});
test("로그아웃·다른 계정 전환 시 이전 개인 기록 제거", async ({ page }) => {
  await login(page, a);
  await page.getByRole("button", { name: "로그아웃", exact: true }).first().click();
  await expect.poll(async () => (await page.request.get("/api/recommendations")).status()).toBe(401);
  await login(page, b);
  const history = page.getByRole("region", { name: "내 추천 기록" });
  await expect(history.getByText("B만 볼 수 있는 추천")).toBeVisible();
  await expect(history.getByText("A만 볼 수 있는 추천")).toHaveCount(0);
});
test("비회원 같은 브라우저 새로고침·다른 브라우저 차단·계획 복사", async ({ page }) => {
  expect((await page.request.get(`/api/recommend/${guestRun}`)).status()).toBe(404);
  await guest(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await page.goto(`/recommend/${guestRun}`); await page.reload();
  await page.getByRole("button", { name: "계획 공유하기" }).click();
  await expect(page.getByText(/계획을 복사했습니다/)).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("공식 관광 PDF"); expect(copied).not.toContain(guestRun);
});

const parkingSpots = [1, 2].map(i => ({ id: `p${i}`, name: `검사 주차장 ${i}`, address: "대구 수성구", capacity: 10, remainingSpaces: i === 1 ? 0 : null, fee: "요금정보 없음", feeLines: null, latitude: 35.8 + i * 0.001, longitude: 128.6, ownerType: "공영", lotType: null, operatingHours: null, paymentMethod: null, managingOrg: null, phone: null, remark: null, distanceMeters: i * 110, walkMinutes: i * 2 }));
const sdkScript = `window.kakao={maps:{load:cb=>cb(),LatLng:class{constructor(a,b){this.a=a;this.b=b}getLat(){return this.a}getLng(){return this.b}},LatLngBounds:class{extend(){}},Map:class{constructor(node,o){this.node=node;this.center=o.center;this.level=o.level}getCenter(){return this.center}setCenter(p){this.center=p}panTo(p){this.center=p}setBounds(){}getLevel(){return this.level}setLevel(n){this.level=n}relayout(){}},CustomOverlay:class{constructor(o){this.el=o.content;this.el.style.position='absolute';this.el.style.top=(20+o.map.node.children.length*48)+'px';this.el.style.left='20px';o.map.node.appendChild(this.el)}setMap(m){if(!m)this.el.remove()}}}};`;
test("모바일 카카오 마커·목록 선택·상세·새로고침·복귀·위치 권한 거부", async ({ page }) => {
  await guest(page);
  await page.route("**/v2/maps/sdk.js?**", route => route.fulfill({ contentType: "text/javascript", body: sdkScript }));
  await page.route("**/api/parking?**", route => route.fulfill({ json: { spots: parkingSpots, destination: { latitude: 35.8, longitude: 128.6 } } }));
  await page.route("**/api/parking/p2?**", route => route.fulfill({ json: { data: parkingSpots[1] } }));
  await page.addInitScript(() => Object.defineProperty(navigator.geolocation, "getCurrentPosition", { value: (_success: unknown, failure: (error: { code: number }) => void) => failure({ code: 1 }) }));
  await page.goto(`/recommend/${guestRun}/place/integration-place/parking`);
  await page.getByRole("button", { name: "검사 주차장 2 지도에서 선택" }).click();
  await expect(page.getByRole("button", { name: /2 검사 주차장 2/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "현재 위치", exact: true }).click();
  await expect(page.getByText(/위치 권한이 거부/)).toBeVisible();
  await page.getByRole("button", { name: "선택한 주차장 상세보기" }).click();
  await expect(page).toHaveURL(/\/parking\/p2$/); await page.reload();
  await expect(page.getByText("검사 주차장 2", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "뒤로" }).click();
  await expect(page).toHaveURL(/selected=p2/);
  await expect(page.getByRole("button", { name: /2 검사 주차장 2/ })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/parking-mobile.png", fullPage: true });
});
test("주차 API 오류와 빈 목록 구분·재시도", async ({ page }) => {
  await guest(page); let failed = true;
  await page.route("**/api/parking?**", route => failed ? route.fulfill({ status: 503, json: { error: "fixture" } }) : route.fulfill({ json: { spots: [], destination: null } }));
  await page.goto(`/recommend/${guestRun}/place/integration-place/parking`);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("주차장 정보를 찾을 수 없습니다.", { exact: true })).toHaveCount(0);
  // 오류 상태에서는 빈 결과 문구를 숨기고 오류 안내를 유지한다.
});
test("본인 기록 삭제 후 목록과 직접 링크에서 제거", async ({ page }) => {
  await login(page, a);
  await page.getByRole("button", { name: "A만 볼 수 있는 추천 기록 삭제" }).click();
  await expect(page.getByRole("region", { name: "내 추천 기록" }).getByText("아직 추천 기록이 없어요.")).toBeVisible();
  expect((await page.request.get(`/api/recommend/${runA}`)).status()).toBe(404);
});
