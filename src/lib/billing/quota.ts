import { prisma } from "@/lib/prisma";
import { FREE_TIER, PLANS, parsePlanCode, periodStartFor, resolveQuota, type QuotaState, type QuotaTier } from "./plans";

import { chargeSubscription } from "./subscription";

// 한도 판정 규칙(resolveQuota)과 타입은 prisma를 안 쓰는 plans.ts에 있다 — self-check가
// DB 없이 그대로 import해서 검증하기 위해서다. 여기는 DB 조회만 얹는 얇은 래퍼다.
export type { QuotaState };

// ponytail: 한도 검사와 실제 실행 사이가 원자적이지 않다 — 같은 사용자가 요청을 동시에
// N개 쏘면 한도를 살짝 넘길 수 있다. 추천 1건이 10초 걸리고 한도가 20~30회라 이걸로
// 얻을 게 없는 어뷰징이라 지금은 감수한다. 문제가 되면 사용 행을 먼저 insert하고
// 실패 시 삭제하는 예약 방식으로 올린다.
// renew: 만료된 주기를 이 자리에서 결제할지. 추천 게이트에서만 true다 — 결제 화면을
// 열어보기만 해도 카드가 긁히면 안 된다.
//
// 로그인이 앱 사용의 전제 조건이 된 뒤로 비로그인 게스트 체험 티어는 없앴다 —
// userId 없이 이 함수를 부르는 경로 자체가 없다(proxy.ts + 각 API의 401 체크).
export async function loadQuota(userId: string, { renew = false } = {}): Promise<QuotaState> {
  const now = new Date();
  const userIdBigInt = BigInt(userId);
  const sub = await prisma.subscription.findUnique({ where: { userId: userIdBigInt } });

  // ponytail: 크론/스케줄러 없이 "사용 시점 지연 갱신"으로 정기결제를 굴린다 — 사용자가
  // 다시 추천을 쓰려고 할 때 만료된 주기를 그 자리에서 결제하고 기간을 굴린다. 대가는
  // 휴면 사용자가 돌아올 때까지 결제되지 않는 것(매출 인식이 늦다). 정확히 매월 걷어야
  // 하면 이 호출을 배치 라우트로 옮기고 크론에서 때리면 된다.
  let current = sub;
  if (renew && sub?.status === "active" && sub.currentPeriodEnd && sub.currentPeriodEnd < now) {
    const user = await prisma.user.findUnique({ where: { id: userIdBigInt }, select: { email: true } });
    await chargeSubscription(sub, user?.email);
    current = await prisma.subscription.findUnique({ where: { userId: userIdBigInt } });
  }

  const planCode = current?.status === "active" ? parsePlanCode(current.planCode) : null;
  const tier: QuotaTier = planCode ? PLANS[planCode] : FREE_TIER;
  const tierName = planCode ? PLANS[planCode].name : "무료";

  const since = periodStartFor(tier, planCode ? current?.currentPeriodStart ?? null : null, now);
  const used = await prisma.recommendationUsage.count({
    where: { userId: userIdBigInt, ...(since ? { createdAt: { gte: since } } : {}) },
  });

  return resolveQuota({ tier, used, tierName, planCode });
}

// 차감. 호출부는 "장소가 담긴 추천이 실제로 나왔을 때"만 부른다 — 실패와 되묻기는
// 여기까지 오지 않는다.
export async function recordUsage(userId: string, agentRunId: string | null) {
  try {
    await prisma.recommendationUsage.create({
      data: { userId: BigInt(userId), agentRunId },
    });
  } catch (err) {
    // 이미 사용자에게 추천을 내려보낸 뒤라 여기서 던지면 정상 응답이 에러로 바뀐다.
    // 기록 실패는 사용자에게 유리한 쪽(차감 안 됨)으로 흘려보내고 로그만 남긴다 —
    // agent_runs 기록 실패를 관대하게 처리하는 것과 같은 원칙.
    console.error("사용량 기록 실패(추천 응답은 정상 반환):", err);
  }
}
