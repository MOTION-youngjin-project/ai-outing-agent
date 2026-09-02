// 외부 API 호출 없는 순수 로직만 검증하는 가벼운 회귀 체크.
// 오늘 실제로 버그가 났던 부분(시/도 정식명칭 매칭, 좌표 변환, 등급 판정,
// HTML 태그 스트립, 요금 null 처리, 장소/지역 매칭, 실내외 추론) 위주로만 다룬다.
// 새 테스트 프레임워크는 추가하지 않음 — node:assert면 충분.
// 실행: node --experimental-strip-types scripts/self-check.ts
import assert from "node:assert/strict";
import { normalizeSido, latLonToGrid } from "../src/lib/region.ts";
import { gradeFromPm10 } from "../src/lib/tools/airQuality.ts";
import { stripTags } from "../src/lib/tools/culturePortal.ts";
import { formatFee } from "../src/lib/tools/parking.ts";
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

console.log(`✓ self-check 통과 (${passed}건)`);
