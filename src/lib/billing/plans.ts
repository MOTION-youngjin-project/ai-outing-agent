// 과금과 관련된 숫자는 전부 여기 있다. 코드 어디에도 횟수·가격을 박지 않는다 —
// 아직 셋 다 확정값이 아니라서(팀 논의 중) 한 파일만 고쳐서 끝나야 한다.
//
// 모델: 가입 시 무료 질문 몇 건 + 이후 건당 선불 크레딧 차감. 크레딧이 모자라면
// 등록된 카드로 자동 충전한다(추천 게이트에서만 — 결제 화면을 열어보기만 해도
// 카드가 긁히면 안 된다).

// 무료 질문 수. 미확정 임시값(2~3건 사이에서 논의 중, 우선 3으로 둔다).
export const FREE_QUESTIONS = 3;

// 질문 1건당 가격. 아직 원가(LangSmith로 집계할 Gemini 토큰 사용량) 조사 전이라
// 미확정 임시값이다.
export const PRICE_PER_QUESTION_KRW = 200;

// 자동/수동 충전 1회 금액. 너무 작은 금액은 일부 카드사가 소액결제로 거절하는
// 경우가 있어 이 정도로 잡았다 — 이 값도 미확정.
export const TOPUP_AMOUNT_KRW = 5000;

export type BalanceState = {
  // 이번 요청이 무료인지, 유료라면 단가가 얼마인지(항상 PRICE_PER_QUESTION_KRW).
  freeRemaining: number;
  balanceKrw: number;
  hasBillingKey: boolean;
};

// 순수 함수. self-check에서 DB 없이 그대로 검증된다.
export function resolveFreeRemaining(freeUsedCount: number): number {
  return Math.max(0, FREE_QUESTIONS - Math.max(0, freeUsedCount));
}

// 다음 질문이 무료인지, 유료라면 크레딧이 충분한지(자동충전 시도 전 판정).
export function canAffordNext(state: Pick<BalanceState, "freeRemaining" | "balanceKrw">): boolean {
  return state.freeRemaining > 0 || state.balanceKrw >= PRICE_PER_QUESTION_KRW;
}
