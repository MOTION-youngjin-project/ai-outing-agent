// 외부 API 호출 없는 순수 로직만 검증하는 가벼운 회귀 체크.
// 오늘 실제로 버그가 났던 부분(시/도 정식명칭 매칭, 좌표 변환, 등급 판정,
// HTML 태그 스트립, 요금 null 처리, 장소/지역 매칭, 실내외 추론) 위주로만 다룬다.
// 새 테스트 프레임워크는 추가하지 않음 — node:assert면 충분.
// 실행: node --experimental-strip-types scripts/self-check.ts
import assert from "node:assert/strict";
import { normalizeSido, latLonToGrid } from "../src/lib/region.ts";
import { gradeFromPm10 } from "../src/lib/tools/airQuality.ts";
import { stripTags } from "../src/lib/tools/culturePortal.ts";
import {
  formatFee,
  formatOperatingHours,
  formatFeeLines,
  formatPaymentMethod,
  haversineMeters,
  estimateWalkMinutes,
} from "../src/lib/tools/parking.ts";
import { latestBaseDateTime } from "../src/lib/tools/weather.ts";
import { pickBestPlaceMatch, pickRegionForAddress, inferEnvironmentMode } from "../src/lib/services/matching.ts";

let passed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  assert.deepStrictEqual(actual, expected, `${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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
const REGION_FIXTURES = [
  { name: "대구광역시", level: "시도" },
  { name: "수성구", level: "구군" },
  { name: "중구", level: "구군" },
];
check(
  "pickRegionForAddress 구/군 우선",
  pickRegionForAddress("대구 수성구 미술관로 40", REGION_FIXTURES),
  { name: "수성구", level: "구군" }
);
check(
  "pickRegionForAddress 구/군 없으면 시/도로 완화(축약형 vs 정식명칭)",
  pickRegionForAddress("대구 남구 앞산순환로 574", REGION_FIXTURES),
  { name: "대구광역시", level: "시도" }
);
check("pickRegionForAddress 매칭 실패", pickRegionForAddress("서울 강남구 테헤란로", REGION_FIXTURES), null);

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

console.log(`✓ self-check 통과 (${passed}건)`);
