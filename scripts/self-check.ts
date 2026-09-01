// 외부 API 호출 없는 순수 로직만 검증하는 가벼운 회귀 체크.
// 오늘 실제로 버그가 났던 부분(시/도 정식명칭 매칭, 좌표 변환, 등급 판정,
// HTML 태그 스트립, 요금 null 처리) 위주로만 다룬다. 새 테스트 프레임워크는
// 추가하지 않음 — node:assert면 충분.
// 실행: node --experimental-strip-types scripts/self-check.ts
import assert from "node:assert/strict";
import { normalizeSido, latLonToGrid } from "../src/lib/region.ts";
import { gradeFromPm10 } from "../src/lib/tools/airQuality.ts";
import { stripTags } from "../src/lib/tools/culturePortal.ts";
import { formatFee } from "../src/lib/tools/parking.ts";

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

console.log(`✓ self-check 통과 (${passed}건)`);
