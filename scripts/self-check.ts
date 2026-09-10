// 외부 API 호출 없는 순수 로직만 검증하는 가벼운 회귀 체크.
// 오늘 실제로 버그가 났던 부분(시/도 정식명칭 매칭, 좌표 변환, 등급 판정,
// HTML 태그 스트립, 요금 null 처리, 장소/지역 매칭, 실내외 추론) 위주로만 다룬다.
// 새 테스트 프레임워크는 추가하지 않음 — node:assert면 충분.
// 실행: node --experimental-strip-types scripts/self-check.ts
import assert from "node:assert/strict";
import { normalizeSido, latLonToGrid } from "../src/lib/region.ts";
import { formatPlannedDate, todayIso } from "../src/lib/textFormat.ts";
import { gradeFromPm10 } from "../src/lib/tools/airQuality.ts";
import { stripTags, isEventEnded, inferDtype } from "../src/lib/tools/culturePortal.ts";
import { isInCooldown, markCooldown } from "../src/lib/agent.ts";
import {
  formatFee,
  formatOperatingHours,
  formatFeeLines,
  formatPaymentMethod,
  haversineMeters,
  estimateWalkMinutes,
} from "../src/lib/tools/parking.ts";
import { latestBaseDateTime } from "../src/lib/tools/weather.ts";
import {
  pickBestPlaceMatch,
  pickRegionForAddress,
  inferEnvironmentMode,
  extractCategoryLabel,
  computeDistanceKm,
} from "../src/lib/services/matching.ts";
import { detectPlatform, buildNaverNavigationPlan } from "../src/lib/externalMapLinks.ts";

let passed = 0;
// Region.id는 BigInt라 기본 JSON.stringify가 던진다 — 실패 메시지 때문에 체크가 죽으면 안 됨.
const show = (v: unknown) => JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? `${val}n` : val));
function check(name: string, actual: unknown, expected: unknown) {
  assert.deepStrictEqual(actual, expected, `${name}: expected ${show(expected)}, got ${show(actual)}`);
  passed++;
}

// normalizeSido — "충청북도".includes("충북")이 false라 별칭 매핑이 필요했던 버그
check("normalizeSido 정식명칭(충청북도)", normalizeSido("충청북도"), "충북");
check("normalizeSido 정식명칭(경상남도)", normalizeSido("경상남도"), "경남");
check("normalizeSido 광역시(대구광역시)", normalizeSido("대구광역시"), "대구");
check("normalizeSido 축약형(서울)", normalizeSido("서울"), "서울");
check("normalizeSido 지원 안 함(수성구)", normalizeSido("수성구"), null);

// latLonToGrid — 기상청 공식 예제 좌표로 검증
const grid = latLonToGrid(37.579871128849334, 126.98935225645221);
check("latLonToGrid 기상청 공식 예제", grid, { nx: 60, ny: 127 });

// gradeFromPm10 — 등급 경계값
check("gradeFromPm10 좋음 상한(30)", gradeFromPm10(30), "좋음");
check("gradeFromPm10 보통 시작(31)", gradeFromPm10(31), "보통");
check("gradeFromPm10 나쁨 시작(81)", gradeFromPm10(81), "나쁨");
check("gradeFromPm10 매우나쁨 시작(151)", gradeFromPm10(151), "매우나쁨");

// stripTags — 실제 HTML 태그는 지우되, 제목의 장식용 꺾쇠괄호는 보존
check("stripTags 실제 태그 제거", stripTags("<p>hello</p>"), "hello");
check("stripTags 한글 꺾쇠괄호 보존", stripTags("<공간드림 1472> 개인전"), "<공간드림 1472> 개인전");

// inferDtype — 약한 폴백 모델이 dtype 없이 부를 때(2026-09-10 recursion limit 루프 원인)
// 쓰는 추정 로직. 찾으면 그 분야, 못 찾으면 시스템 프롬프트 기본값(전시)로 떨어져야 한다.
check("inferDtype 텍스트에 분야명 포함", inferDtype("대구 콘서트 보러 가고 싶어"), "콘서트");
check("inferDtype 매칭 안 되면 기본값(전시)", inferDtype("대구 아이랑 유모차 무료 반나절"), "전시");
check("inferDtype 빈 문자열도 기본값(전시)", inferDtype(""), "전시");

// isEventEnded — 2026-09-08 사용자 피드백("끝난 행사가 보임") 재발 방지.
// now를 주입해서 실제 시계와 무관하게 검증한다.
const CHECK_NOW = new Date("2026-09-08T12:00:00+09:00").getTime();
check("isEventEnded 이미 끝남", isEventEnded("20260901 ~ 20260906", CHECK_NOW), true);
check("isEventEnded 아직 진행중", isEventEnded("20260902 ~ 20260913", CHECK_NOW), false);
check("isEventEnded 오늘이 마지막날(자정 전까지 진행중 취급)", isEventEnded("20260901 ~ 20260908", CHECK_NOW), false);
check("isEventEnded 형식이 다르면 숨기지 않음", isEventEnded("상시", CHECK_NOW), false);

// isInCooldown/markCooldown — 2026-09-08 성능 조사에서 추가한 모델별 쿨다운(쿼터 소진뿐
// 아니라 recursion limit 등 재시도 가능한 에러 전반에 적용). 매 요청마다 이미 문제 있는
// 모델을 다시 두드리지 않게 하는 로직이라 회귀 시 조용히 다시 느려진다.
const COOLDOWN_CHECK_MODEL = "__self-check-model__";
check("isInCooldown 마킹 전에는 false", isInCooldown(COOLDOWN_CHECK_MODEL, 1000), false);
markCooldown(COOLDOWN_CHECK_MODEL, 1000);
check("isInCooldown 마킹 직후(쿨다운 내)", isInCooldown(COOLDOWN_CHECK_MODEL, 1000 + 1000), true);
check("isInCooldown 쿨다운(60초) 지나면 해제", isInCooldown(COOLDOWN_CHECK_MODEL, 1000 + 60_000 + 1), false);

// formatFee — crgLevySeNm이 null일 때 "null" 문자열이 그대로 노출되던 버그
check("formatFee 무료", formatFee("무료", null), "무료");
check("formatFee 시간당 요금", formatFee(null, 3000), "시간당 3000원");
check("formatFee 정보 없음(둘 다 null)", formatFee(null, null), "요금정보 없음");
// gnrlOneHrCrg === 0(무료지만 "무료" 플래그가 안 붙은 경우)이 falsy라 요금정보 없음으로 빠지던 버그
check("formatFee 시간당 0원", formatFee(null, 0), "시간당 0원");

// latestBaseDateTime — 로컬 Date 게터로 계산해 서버가 UTC로 돌면 날짜 경계 근처에서
// 발표 주기를 잘못 고르던 버그. UTC 인스턴트를 직접 넣어 서버 타임존과 무관하게 검증한다.
check(
  "latestBaseDateTime KST 09:05 -> 08시 발표",
  latestBaseDateTime(new Date("2026-09-03T00:05:00Z")),
  { base_date: "20260903", base_time: "0800" }
);
check(
  "latestBaseDateTime KST 00:30(자정 넘김) -> 전날 23시 발표",
  latestBaseDateTime(new Date("2026-09-02T15:30:00Z")),
  { base_date: "20260902", base_time: "2300" }
);

// pickBestPlaceMatch — 카카오 검색 결과 중 동명이인 오매칭 방지용 정확 일치 우선 로직.
// 오늘 이 로직이 없던 시절엔 항상 첫 결과("대구미술관 주차장" 등)를 골라버리는 버그가 날 뻔했음.
check(
  "pickBestPlaceMatch 정확 일치 우선",
  pickBestPlaceMatch("대구미술관", [{ place_name: "대구미술관 주차장" }, { place_name: "대구미술관" }]),
  { place_name: "대구미술관" }
);
check(
  "pickBestPlaceMatch 정확 일치 없으면 첫 결과",
  pickBestPlaceMatch("전혀다른이름", [{ place_name: "이디야커피" }, { place_name: "스타벅스" }]),
  { place_name: "이디야커피" }
);
check("pickBestPlaceMatch 결과 없음", pickBestPlaceMatch("아무거나", []), undefined);

// pickRegionForAddress — 오늘 실제로 났던 버그(정확히 일치 검색이라 "대구"가 "대구광역시" 시드
// 행을 못 찾고 매번 중복 생성하던 것)의 재발 방지 + 구/군 우선 매칭까지 함께 검증.
const DAEGU = { id: 1n, name: "대구광역시", level: "시도", parentId: null };
const SEOUL = { id: 2n, name: "서울특별시", level: "시도", parentId: null };
const REGION_FIXTURES = [
  DAEGU,
  SEOUL,
  { id: 11n, name: "수성구", level: "구군", parentId: 1n },
  { id: 12n, name: "중구", level: "구군", parentId: 1n },
];
check(
  "pickRegionForAddress 구/군 우선",
  pickRegionForAddress("대구 수성구 미술관로 40", REGION_FIXTURES),
  REGION_FIXTURES[2]
);
check(
  "pickRegionForAddress 구/군 없으면 시/도로 완화(축약형 vs 정식명칭)",
  pickRegionForAddress("대구 남구 앞산순환로 574", REGION_FIXTURES),
  DAEGU
);
// 구/군 이름은 시/도끼리 겹친다 — 서울 중구 주소에 대구 중구가 붙으면 엉뚱한 주차 정보가 뜬다.
check(
  "pickRegionForAddress 다른 시/도의 동명 구/군은 매칭 안 함",
  pickRegionForAddress("서울 중구 세종대로 110", REGION_FIXTURES),
  SEOUL
);
check("pickRegionForAddress 매칭 실패", pickRegionForAddress("부산 해운대구 우동", REGION_FIXTURES), null);

// inferEnvironmentMode — agent.ts가 구조화된 필드로 안 주는 실내/야외를 텍스트에서 추론.
const baseRec = { needsMoreInfo: false as const, message: "" };
check(
  "inferEnvironmentMode 실내만",
  inferEnvironmentMode({ ...baseRec, message: "시원한 실내 미술관에서 감상하기 좋아요" }),
  "indoor"
);
check(
  "inferEnvironmentMode 야외만",
  inferEnvironmentMode({ ...baseRec, message: "호수 산책과 전망대 야경을 즐겨보세요" }),
  "outdoor"
);
check(
  "inferEnvironmentMode 둘 다 섞이면 mixed",
  inferEnvironmentMode({ ...baseRec, message: "낮엔 실내 미술관, 저녁엔 호수 산책과 야경" }),
  "mixed"
);
check("inferEnvironmentMode 신호 없으면 mixed", inferEnvironmentMode({ ...baseRec, message: "좋은 곳이에요" }), "mixed");

// extractCategoryLabel — 카카오 category_name 계층에서 가장 구체적인 마지막 항목만 추출
check("extractCategoryLabel 계층에서 마지막 항목", extractCategoryLabel("여행 > 관광,명소 > 공원 > 도시공원"), "도시공원");
check("extractCategoryLabel 단일 항목", extractCategoryLabel("카페"), "카페");
check("extractCategoryLabel null", extractCategoryLabel(null), null);

// computeDistanceKm — 소수 첫째자리 반올림, origin/place 중 하나라도 없으면 null
check(
  "computeDistanceKm 서울시청-부산시청 대략 325km",
  Math.round(computeDistanceKm({ latitude: 37.5665, longitude: 126.978 }, { latitude: 35.1796, longitude: 129.0756 })!),
  325
);
check("computeDistanceKm origin 없음", computeDistanceKm(null, { latitude: 35.1796, longitude: 129.0756 }), null);
check("computeDistanceKm place 없음", computeDistanceKm({ latitude: 37.5665, longitude: 126.978 }, null), null);

// formatOperatingHours — 24시간 코드와 시간대 문자열("0900") 파싱, 둘 다 없으면 null
check("formatOperatingHours 전일운영", formatOperatingHours({ operHrWkdaySeCd: "전일운영", wkdayOperBgngHr: "", wkdayOperEndHr: "" }), "24시간");
check(
  "formatOperatingHours 시간제운영 파싱",
  formatOperatingHours({ operHrWkdaySeCd: "시간제운영", wkdayOperBgngHr: "0900", wkdayOperEndHr: "1800" }),
  "09:00 - 18:00"
);
check("formatOperatingHours 정보 없음", formatOperatingHours({ operHrWkdaySeCd: null, wkdayOperBgngHr: null, wkdayOperEndHr: null }), null);

// formatFeeLines — 무료 우선, 상세 필드 조합, 둘 다 없으면 한 줄 요약으로 폴백
check("formatFeeLines 무료", formatFeeLines({ crgLevySeNm: "무료", gnrlFrstCrgLevyHr: null, gnrlFrstCrg: null, gnrlAddCrgLevyHr: null, gnrlMntbyAddCrg: null, gnrlOneDayCrg: null, gnrlOneHrCrg: null }), ["무료"]);
check(
  "formatFeeLines 상세 조합",
  formatFeeLines({ crgLevySeNm: "유료", gnrlFrstCrgLevyHr: "30", gnrlFrstCrg: 0, gnrlAddCrgLevyHr: "10", gnrlMntbyAddCrg: 300, gnrlOneDayCrg: 6000, gnrlOneHrCrg: null }),
  ["최초 30분 무료", "이후 10분당 300원", "1일 최대 6,000원"]
);
check(
  "formatFeeLines 상세 없으면 한 줄 요약 폴백",
  formatFeeLines({ crgLevySeNm: null, gnrlFrstCrgLevyHr: null, gnrlFrstCrg: null, gnrlAddCrgLevyHr: null, gnrlMntbyAddCrg: null, gnrlOneDayCrg: null, gnrlOneHrCrg: 3000 }),
  ["시간당 3000원"]
);

// formatPaymentMethod — API 원본이 "+"로 구분해서 주는 걸 사람이 읽기 좋게 ", "로 변환
check("formatPaymentMethod 복수 수단", formatPaymentMethod("현금+신용카드"), "현금, 신용카드");
check("formatPaymentMethod 정보 없음", formatPaymentMethod(null), null);
check("formatPaymentMethod 빈 문자열", formatPaymentMethod(""), null);

// haversineMeters — 같은 지점은 0, 위경도 1도(적도 기준 약 111.2km) 근사값 검증
check("haversineMeters 동일 지점", Math.round(haversineMeters({ latitude: 35.86, longitude: 128.62 }, { latitude: 35.86, longitude: 128.62 })), 0);
check(
  "haversineMeters 위도 1도 차이 ≈111.2km",
  Math.round(haversineMeters({ latitude: 35.0, longitude: 128.0 }, { latitude: 36.0, longitude: 128.0 }) / 1000),
  111
);

// estimateWalkMinutes — 최소 1분 보장, 67m/분 환산
check("estimateWalkMinutes 최소 1분", estimateWalkMinutes(10), 1);
check("estimateWalkMinutes 120m ≈ 2분", estimateWalkMinutes(120), 2);

// 방문 예정일 — 시각 없는 날짜라 타임존에 따라 하루씩 밀리기 쉬운 부분만 고정한다.
check("formatPlannedDate 요일 계산", formatPlannedDate("2026-09-20"), "9월 20일 (일)");
check("formatPlannedDate 월초 경계", formatPlannedDate("2026-01-01"), "1월 1일 (목)");
// UTC 기준으로 읽지 않으면 UTC-5 같은 지역에서 하루 앞당겨져 19일로 나온다.
check("formatPlannedDate 자정 경계에서 안 밀림", formatPlannedDate("2026-03-01"), "3월 1일 (일)");
// todayIso는 로컬 날짜여야 한다 — UTC로 읽으면 밤 시간대에 하루 어긋난다.
// new Date(y, m, d, ...)는 어느 타임존에서 돌리든 그 지역의 해당 날짜를 만들므로
// 이 검사는 실행 머신 타임존과 무관하게 결정적이다.
check("todayIso 로컬 자정 직전", todayIso(new Date(2026, 8, 9, 23, 30)), "2026-09-09");
check("todayIso 로컬 자정 직후", todayIso(new Date(2026, 8, 10, 0, 30)), "2026-09-10");

// detectPlatform / buildNaverNavigationPlan — 네이버 지도는 길찾기 웹 URL이 없어서
// (NCP 포럼 공식 확인) 플랫폼별로 다른 전략을 타는데, 분기가 틀리면 안드로이드에서
// iOS용 스킴을 쏘는 등 조용히 아예 안 열리는 버그가 난다.
check("detectPlatform iOS", detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), "ios");
check("detectPlatform Android", detectPlatform("Mozilla/5.0 (Linux; Android 14; SM-S911N)"), "android");
check("detectPlatform 데스크톱", detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "other");

const naverIos = buildNaverNavigationPlan("ios", 35.8281, 128.5779, "수성못");
check("buildNaverNavigationPlan iOS는 app-with-fallback", naverIos.kind, "app-with-fallback");
check(
  "buildNaverNavigationPlan iOS nmap:// 파라미터",
  naverIos.kind === "app-with-fallback" ? naverIos.appUrl : null,
  "nmap://route/car?dlat=35.8281&dlng=128.5779&dname=%EC%88%98%EC%84%B1%EB%AA%BB&appname=com.aioutingagent.web"
);

const naverAndroid = buildNaverNavigationPlan("android", 35.8281, 128.5779, "수성못");
check("buildNaverNavigationPlan Android는 intent", naverAndroid.kind, "intent");
check(
  "buildNaverNavigationPlan Android intent에 Play스토어 폴백 포함",
  naverAndroid.kind === "intent" ? naverAndroid.url.includes("play.google.com") : false,
  true
);

const naverDesktop = buildNaverNavigationPlan("other", 35.8281, 128.5779, "수성못");
check(
  "buildNaverNavigationPlan 데스크톱은 위치표시 웹 URL",
  naverDesktop.kind === "web" ? naverDesktop.url : null,
  "https://map.naver.com/?lng=128.5779&lat=35.8281&title=%EC%88%98%EC%84%B1%EB%AA%BB"
);

console.log(`✓ self-check 통과 (${passed}건)`);
