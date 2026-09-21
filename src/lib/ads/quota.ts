import { prisma } from "@/lib/prisma";

// 결제(billing/*) 대신 쓰는 게이트. 사업자등록 전까지 돈을 받을 방법이 없어서
// 하루 1건 무료 + 광고 시청당 질문권 1개(무제한)로 간다. billing/* 코드는 나중에
// 사업자등록되면 다시 쓸 수 있게 그대로 두고, recommend 라우트만 이쪽을 탄다.

export type AdQuotaState = {
  freeAvailableToday: boolean;
  credits: number;
};

// 순수 함수. self-check에서 그대로 검증된다.
export function isFreeAvailable(lastFreeAt: Date | null, now: Date): boolean {
  if (!lastFreeAt) return true;
  return lastFreeAt.toDateString() !== now.toDateString();
}

export async function loadAdQuota(userId: string): Promise<AdQuotaState> {
  const record = await prisma.adCredit.findUnique({ where: { userId: BigInt(userId) } });
  return {
    freeAvailableToday: isFreeAvailable(record?.lastFreeAt ?? null, new Date()),
    credits: record?.credits ?? 0,
  };
}

export type AdAffordabilityResult = { allowed: true; source: "daily_free" | "ad_credit" } | { allowed: false };

// 추천 게이트. 하루 무료가 남았으면 그걸 쓰고, 아니면 광고로 쌓인 질문권을 쓴다.
export async function ensureQuestionAllowed(userId: string): Promise<AdAffordabilityResult> {
  const quota = await loadAdQuota(userId);
  if (quota.freeAvailableToday) return { allowed: true, source: "daily_free" };
  if (quota.credits > 0) return { allowed: true, source: "ad_credit" };
  return { allowed: false };
}

// 소진. 호출부는 "장소가 담긴 추천이 실제로 나왔을 때"만 부른다.
export async function consumeQuestion(userId: string, source: "daily_free" | "ad_credit") {
  const userIdBigInt = BigInt(userId);
  try {
    if (source === "daily_free") {
      await prisma.adCredit.upsert({
        where: { userId: userIdBigInt },
        update: { lastFreeAt: new Date() },
        create: { userId: userIdBigInt, lastFreeAt: new Date() },
      });
    } else {
      await prisma.adCredit.update({ where: { userId: userIdBigInt }, data: { credits: { decrement: 1 } } });
    }
  } catch (err) {
    // 이미 사용자에게 추천을 내려보낸 뒤라 여기서 던지면 정상 응답이 에러로 바뀐다.
    console.error("질문권 소진 기록 실패(추천 응답은 정상 반환):", err);
  }
}

// 광고 시청 완료 후 질문권 +1. ponytail: 지금은 클라이언트가 "다 봤다"고 부르면 그대로
// 믿는다 — AdMob 리워드 광고를 실제로 붙이면 SSV(서버 검증 콜백)로 바꿔서 위조 신고를
// 막아야 한다(토스 웹훅과 같은 이유로, 클라이언트 신고를 신뢰 경계 밖으로 봐야 함).
export async function grantAdCredit(userId: string) {
  const userIdBigInt = BigInt(userId);
  await prisma.adCredit.upsert({
    where: { userId: userIdBigInt },
    update: { credits: { increment: 1 } },
    create: { userId: userIdBigInt, credits: 1 },
  });
}
