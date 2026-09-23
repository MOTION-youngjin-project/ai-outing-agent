import { prisma } from "@/lib/prisma";
import { PRICE_PER_QUESTION_KRW, resolveFreeRemaining, type BalanceState } from "./plans";
import { topUpWallet } from "./wallet";

export type { BalanceState };

// 화면 표시용(잔액/무료 남은 횟수). 자동충전은 시도하지 않는다 — 결제 화면을
// 열어보기만 해도 카드가 긁히면 안 된다.
export async function loadBalance(userId: string): Promise<BalanceState> {
  const userIdBigInt = BigInt(userId);
  const [freeUsedCount, wallet] = await Promise.all([
    prisma.recommendationUsage.count({ where: { userId: userIdBigInt, costKrw: 0 } }),
    prisma.wallet.findUnique({ where: { userId: userIdBigInt } }),
  ]);
  return {
    freeRemaining: resolveFreeRemaining(freeUsedCount),
    balanceKrw: wallet?.balanceKrw ?? 0,
    hasBillingKey: !!wallet?.billingKey,
  };
}

export type AffordabilityResult =
  | { allowed: true; cost: number }
  | { allowed: false; reason: "no_billing_key" | "topup_failed"; balanceKrw: number };

// 추천 게이트. 무료 남은 게 있으면 무료(cost 0). 아니면 잔액을 보고, 모자라면
// 등록된 카드로 자동충전을 "이 자리에서" 한 번 시도한다 — 추천 게이트에서만
// 부르는 함수라 여기서 카드가 긁히는 건 정책상 맞다(결제 화면 조회와는 다르다).
export async function ensureAffordable(userId: string, customerEmail?: string | null): Promise<AffordabilityResult> {
  const userIdBigInt = BigInt(userId);
  const freeUsedCount = await prisma.recommendationUsage.count({ where: { userId: userIdBigInt, costKrw: 0 } });
  if (resolveFreeRemaining(freeUsedCount) > 0) return { allowed: true, cost: 0 };

  const wallet = await prisma.wallet.findUnique({ where: { userId: userIdBigInt } });
  if (wallet && wallet.balanceKrw >= PRICE_PER_QUESTION_KRW) return { allowed: true, cost: PRICE_PER_QUESTION_KRW };
  if (!wallet?.billingKey) return { allowed: false, reason: "no_billing_key", balanceKrw: wallet?.balanceKrw ?? 0 };

  const topped = await topUpWallet(wallet, customerEmail);
  if (!topped) return { allowed: false, reason: "topup_failed", balanceKrw: wallet.balanceKrw };
  return { allowed: true, cost: PRICE_PER_QUESTION_KRW };
}

// 차감. 호출부는 "장소가 담긴 추천이 실제로 나왔을 때"만 부른다 — 실패와 되묻기는
// 여기까지 오지 않는다. cost가 0(무료분)이면 잔액은 건드리지 않는다.
export async function recordUsage(userId: string, agentRunId: string | null, cost: number) {
  try {
    const userIdBigInt = BigInt(userId);
    await prisma.$transaction([
      prisma.recommendationUsage.create({ data: { userId: userIdBigInt, agentRunId, costKrw: cost } }),
      ...(cost > 0 ? [prisma.wallet.update({ where: { userId: userIdBigInt }, data: { balanceKrw: { decrement: cost } } })] : []),
    ]);
  } catch (err) {
    // 이미 사용자에게 추천을 내려보낸 뒤라 여기서 던지면 정상 응답이 에러로 바뀐다.
    // 기록 실패는 사용자에게 유리한 쪽(차감 안 됨)으로 흘려보내고 로그만 남긴다.
    console.error("사용량 기록 실패(추천 응답은 정상 반환):", err);
  }
}
