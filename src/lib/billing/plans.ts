// 과금과 관련된 숫자는 전부 여기 있다. 코드 어디에도 횟수·가격을 박지 않는다 —
// 플랜 정의가 바뀌는 건 기정사실이라(가격도 횟수도 아직 확정 아님) 한 파일만 고쳐서
// 끝나야 한다.
//
// 이 레이어는 모델과 무관하다. 지금은 Gemini 무료 티어(하루 20회, 프로젝트 단위)를
// 쓰고 있지만 나중에 유료 모델로 갈아끼워도 여기는 안 바뀐다.

// 쿼터를 세는 기간. "lifetime"은 계정(또는 게스트 쿠키) 생성 이후 전부,
// "month"는 기간 시작 이후만 센다.
export type QuotaWindow = "lifetime" | "month";
export type QuotaTier = { limit: number; window: QuotaWindow };

// 비로그인 게스트 체험분. 쿠키(GUEST_COOKIE) 1개당이라 쿠키를 지우면 리셋된다 —
// 막을 방법이 없어서 막지 않고, 대신 "맛보기" 수준으로만 준다(가입 전환이 목적).
export const GUEST_TRIAL: QuotaTier = { limit: 3, window: "lifetime" };

// 가입 후 무료분. window를 "month"로 바꾸면 매월 리셋되는 무료 티어가 된다 —
// 지금 "lifetime"인 이유는 매월 리셋하면 기본 플랜(20회)과의 격차가 10회뿐이라
// 구독할 이유가 없어지기 때문. 횟수(10)는 사용자가 아직 확정하지 않은 임시값이다.
export const FREE_TIER: QuotaTier = { limit: 10, window: "lifetime" };

// 유료 플랜. priceKrw는 자리만 잡아둔 임시 가격으로 아직 확정된 값이 아니다.
// 상위 플랜일수록 나중에 더 좋은 모델을 붙일 자리 — 지금은 한도만 다르다.
export const PLANS = {
  basic: { name: "기본", priceKrw: 4900, limit: 20, window: "month" },
  plus: { name: "플러스", priceKrw: 9900, limit: 30, window: "month" },
} as const satisfies Record<string, QuotaTier & { name: string; priceKrw: number }>;

export type PlanCode = keyof typeof PLANS;

// 클라이언트가 보낸 planCode를 그대로 믿지 않기 위한 관문. 돈이 걸린 값이라
// 문자열 → PlanCode 변환은 반드시 여기를 통과한다.
export function parsePlanCode(value: unknown): PlanCode | null {
  return typeof value === "string" && value in PLANS ? (value as PlanCode) : null;
}

export type QuotaState = {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
  // 화면에 "기본 12/20회"처럼 표시할 이름. 무료/체험분도 이름을 갖는다.
  tierName: string;
  // 구독 중이면 플랜 코드. 결제 화면이 "현재 플랜"을 표시하는 데 쓴다.
  planCode: string | null;
};

// 한도 판정. 순수 함수라 self-check에서 그대로 검증되고(DB도 prisma import도 없다),
// "왜 막혔는지"를 설명하는 규칙이 이 한 곳에만 있다.
export function resolveQuota(input: { tier: QuotaTier; used: number; tierName: string; planCode?: string | null }): QuotaState {
  const { limit } = input.tier;
  const used = Math.max(0, input.used);
  return {
    allowed: used < limit,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    tierName: input.tierName,
    planCode: input.planCode ?? null,
  };
}

// "이 시점 이후만 센다"의 기준 시각. lifetime이면 null(전부 센다). 구독은 자기 결제
// 주기가 기준이고, 무료 티어를 월간으로 돌릴 경우엔 달력상 이번 달 1일이다.
export function periodStartFor(tier: QuotaTier, subscriptionPeriodStart: Date | null, now: Date): Date | null {
  if (tier.window === "lifetime") return null;
  return subscriptionPeriodStart ?? new Date(now.getFullYear(), now.getMonth(), 1);
}

// 구독 한 주기의 길이. 달마다 일수가 다른 걸 따지지 않고 고정 30일로 굴린다 —
// ponytail: 월말(31일) 구독이 다음 달에 어느 날짜로 가는지 같은 문제를 아예 없앤다.
// 정확한 "매월 같은 날" 청구가 필요해지면 여기만 날짜 계산으로 바꾸면 된다.
export const PERIOD_DAYS = 30;
