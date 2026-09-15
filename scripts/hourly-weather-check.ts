import assert from "node:assert/strict";
import { latestBaseDateTime } from "../src/lib/tools/weather.ts";

assert.deepEqual(latestBaseDateTime(new Date("2026-09-15T05:20:00Z")), { base_date: "20260915", base_time: "1400" });
console.log("시간별 날씨 발표시각 계산 검사 통과");
