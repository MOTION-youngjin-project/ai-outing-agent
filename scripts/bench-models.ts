import "../load-env";
import { runAgentOnce, RecommendationSchema, type ChatTurn } from "../src/lib/agent";
import { resolvePlaceByName } from "../src/lib/services/places";

// 폴백 체인 순서를 "가장 정확한 것 중 가장 빠른 것"으로 정하기 위한 실측용 스크립트.
// 같은 질문을 모델별로 돌려서 소요시간과 정확도를 같이 잰다. 정확도 지표는 두 가지:
//  - 실재율: 추천한 장소가 카카오 로컬 검색에서 실제로 찾아지는 비율(환각 탐지)
//  - 지역일치율: 찾아진 장소가 질문에서 요구한 구/군에 있는 비율
// 무료 티어는 모델별 분당 5회 제한이라 호출 사이에 간격을 둔다.
const MODELS = process.env.BENCH_MODELS?.split(",") ?? [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
];
const SITUATION = "대구 날씨 예보(29도, 구름많음, 강수확률 30%), 미세먼지 좋음(PM10 25).";
const CASES = [
  { name: "실내 데이트", district: "중구", query: "대구광역시에서 중구에서 데이트하기 좋은 실내 코스 추천해줘" },
  { name: "아이 동반", district: "수성구", query: "대구광역시에서 수성구에서 아이랑 갈만한 곳 추천해줘" },
  { name: "저비용 반나절", district: "중구", query: "대구광역시에서 돈 안 쓰고 반나절 정도 중구에서 놀 곳 추천해줘" },
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Row = { model: string; case: string; sec: number; places: number; real: number; district: number; error?: string };
const rows: Row[] = [];

for (const model of MODELS) {
  for (const testCase of CASES) {
    const history: ChatTurn[] = [{ role: "user", content: testCase.query }];
    const started = Date.now();
    try {
      const recommendation = await runAgentOnce(model, history, SITUATION);
      const sec = (Date.now() - started) / 1000;
      RecommendationSchema.parse(recommendation); // 스키마를 못 지키면 여기서 실패로 잡힌다
      const places = recommendation.places ?? [];
      // 카카오 검색으로 실제 존재 여부와 위치를 확인 — 앱이 추천 후에 하는 것과 같은 검증.
      const resolved = await Promise.all(places.map((p) => resolvePlaceByName(p.name, "대구").catch(() => null)));
      const real = resolved.filter(Boolean).length;
      const district = resolved.filter((p) => p && (p.roadAddress ?? p.jibunAddress ?? "").includes(testCase.district)).length;
      rows.push({ model, case: testCase.name, sec, places: places.length, real, district });
      console.log(`${model} / ${testCase.name}: ${sec.toFixed(1)}s, 장소 ${places.length}개, 실재 ${real}, ${testCase.district} ${district}`);
    } catch (err) {
      const sec = (Date.now() - started) / 1000;
      const message = err instanceof Error ? err.message : String(err);
      rows.push({ model, case: testCase.name, sec, places: 0, real: 0, district: 0, error: message.slice(0, 80) });
      console.log(`${model} / ${testCase.name}: ${sec.toFixed(1)}s 실패 — ${message.slice(0, 80)}`);
    }
    await sleep(15000); // 분당 5회 제한 회피
  }
}

console.log("\n=== 요약 (정확도 먼저, 같으면 빠른 순) ===");
const summary = MODELS.map((model) => {
  const mine = rows.filter((r) => r.model === model);
  const ok = mine.filter((r) => !r.error);
  const places = ok.reduce((sum, r) => sum + r.places, 0);
  return {
    model,
    성공: `${ok.length}/${mine.length}`,
    평균초: ok.length ? +(ok.reduce((s, r) => s + r.sec, 0) / ok.length).toFixed(1) : null,
    실재율: places ? Math.round((ok.reduce((s, r) => s + r.real, 0) / places) * 100) + "%" : "-",
    지역일치: places ? Math.round((ok.reduce((s, r) => s + r.district, 0) / places) * 100) + "%" : "-",
    장소수: places,
  };
});
console.table(summary);
