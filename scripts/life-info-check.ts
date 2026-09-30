import assert from "node:assert/strict";
import { extractLifeInfoByRules } from "../src/lib/services/life-info.ts";

const items = extractLifeInfoByRules([
  { title: "방문 안내", url: "https://example.go.kr/info", description: "경기일 무료 셔틀버스를 운행하며 임시 주차장을 이용할 수 있습니다.", publishedAt: "2026-09-01T00:00:00.000Z", authority: "official" },
  { title: "식당 이용 안내", url: "https://restaurant.example/info", description: "제휴 주차장 이용 시 식사 고객은 1시간 무료 주차 가능합니다.", publishedAt: null, authority: "community" },
]);
assert.equal(items.find((item) => item.topic === "access")?.confidence, "confirmed");
assert.equal(items.find((item) => item.topic === "parking")?.confidence, "confirmed");
assert.ok(items.every((item) => item.sourceIndexes.length > 0));
console.log("생활정보 규칙 추출·출처 연결 검사 통과");
