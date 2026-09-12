import "../load-env";

// 추천한 장소가 카카오 로컬 검색에 실제로 잡히는 비율(실재율)을 쿼터 0으로 재는 스크립트.
// 모델을 다시 부르지 않는다 — agent_runs.recommendation_json.places[].placeId에 카카오 매칭
// 성공/실패가 이미 남아 있어서(src/lib/services/recommendations.ts) 과거 실사용 요청을 그대로
// 집계하면 된다. Gemini 무료 쿼터가 모델당 하루 20요청뿐이라 bench-models.ts로는 before/after를
// 같은 날 재기 어려워서 이 경로를 쓴다. 프로덕션 서버에서도 같은 명령으로 돌아간다:
//   npx tsx scripts/place-hit-rate.ts
// 프롬프트·모델을 바꾼 날짜를 기준으로 표가 before/after로 갈라진다.

export type HitRateRun = {
  startedAt: Date;
  userQuery: string | null;
  recommendationJson: unknown;
};

export function summarize(runs: HitRateRun[]) {
  const byDay = new Map<string, { 추천건수: number; 장소수: number; 실재: number }>();
  const misses: { day: string; name: string; query: string | null }[] = [];

  for (const run of runs) {
    const places = (run.recommendationJson as { places?: { name?: string; placeId?: string | null }[] } | null)?.places;
    if (!places?.length) continue; // 지역을 되물은 응답(needsMoreInfo)은 places가 없다
    const day = run.startedAt.toISOString().slice(0, 10);
    const stat = byDay.get(day) ?? { 추천건수: 0, 장소수: 0, 실재: 0 };
    stat.추천건수 += 1;
    for (const place of places) {
      stat.장소수 += 1;
      if (place.placeId) stat.실재 += 1;
      else misses.push({ day, name: place.name ?? "(이름 없음)", query: run.userQuery });
    }
    byDay.set(day, stat);
  }

  const days = [...byDay].map(([날짜, s]) => ({
    날짜,
    ...s,
    실재율: Math.round((s.실재 / s.장소수) * 100) + "%",
  }));
  return { days, misses };
}

if (import.meta.main) {
  const { prisma } = await import("../src/lib/prisma");
  const runs = await prisma.agentRun.findMany({
    where: { status: { in: ["completed", "partial"] }, recommendationJson: { not: null } },
    select: { startedAt: true, userQuery: true, recommendationJson: true },
    orderBy: { startedAt: "asc" },
  });
  const { days, misses } = summarize(runs);
  console.table(days);
  // 실패한 이름을 그대로 보여준다 — "동성로 카페거리 및 실내 체험 공간"처럼 뭉뚱그린 이름이
  // 원인이라는 가설을 눈으로 확인하는 게 이 스크립트의 핵심 용도다.
  console.log(`\n=== 검색 안 된 이름 (최근 30개 / 총 ${misses.length}개) ===`);
  for (const m of misses.slice(-30)) console.log(`${m.day}  ${m.name}${m.query ? `  ← ${m.query}` : ""}`);
  await prisma.$disconnect();
}
