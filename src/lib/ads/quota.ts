import { prisma } from "@/lib/prisma";

// 결제(billing/*) 대신 쓰는 게이트. 사업자등록 전까지 돈을 받을 방법이 없어서
// 광고 기반으로 간다 — 로그인 없이도(게스트) 광고를 보면 질문권을 쌓을 수 있다.
// 로그인 사용자만 하루 무료 1건이 추가로 있다 — 게스트는 계정이 없어 쿠키만
// 지우면 무한 리셋되므로 그 하루 무료는 안 준다. billing/* 코드는 나중에
// 사업자등록되면 다시 쓸 수 있게 그대로 두고 건드리지 않는다.

export type Owner = { userId: string } | { sessionKeyHash: string };

function ownerWhere(owner: Owner) {
  return "userId" in owner ? { userId: BigInt(owner.userId) } : { sessionKeyHash: owner.sessionKeyHash };
}
function ownerCreateData(owner: Owner) {
  return "userId" in owner ? { userId: BigInt(owner.userId) } : { sessionKeyHash: owner.sessionKeyHash };
}

export type AdQuotaState = {
  freeAvailableToday: boolean;
  credits: number;
};

// 순수 함수. self-check에서 그대로 검증된다.
export function isFreeAvailable(lastFreeAt: Date | null, now: Date): boolean {
  if (!lastFreeAt) return true;
  return lastFreeAt.toDateString() !== now.toDateString();
}

export async function loadAdQuota(owner: Owner): Promise<AdQuotaState> {
  const record = await prisma.adCredit.findUnique({ where: ownerWhere(owner) });
  const freeAvailableToday = "userId" in owner ? isFreeAvailable(record?.lastFreeAt ?? null, new Date()) : false;
  return { freeAvailableToday, credits: record?.credits ?? 0 };
}

export type AdAffordabilityResult = { allowed: true; source: "daily_free" | "ad_credit" } | { allowed: false };

// 추천 게이트. 로그인 사용자는 하루 무료가 남았으면 그걸 쓰고, 아니면(게스트는 항상)
// 광고로 쌓인 질문권을 쓴다.
export async function ensureQuestionAllowed(owner: Owner): Promise<AdAffordabilityResult> {
  const quota = await loadAdQuota(owner);
  if (quota.freeAvailableToday) return { allowed: true, source: "daily_free" };
  if (quota.credits > 0) return { allowed: true, source: "ad_credit" };
  return { allowed: false };
}

// 소진. 호출부는 "장소가 담긴 추천이 실제로 나왔을 때"만 부른다.
export async function consumeQuestion(owner: Owner, source: "daily_free" | "ad_credit") {
  try {
    if (source === "daily_free") {
      await prisma.adCredit.upsert({
        where: ownerWhere(owner),
        update: { lastFreeAt: new Date() },
        create: { ...ownerCreateData(owner), lastFreeAt: new Date() },
      });
    } else {
      await prisma.adCredit.update({ where: ownerWhere(owner), data: { credits: { decrement: 1 } } });
    }
  } catch (err) {
    // 이미 사용자에게 추천을 내려보낸 뒤라 여기서 던지면 정상 응답이 에러로 바뀐다.
    console.error("질문권 소진 기록 실패(추천 응답은 정상 반환):", err);
  }
}

// 광고 시청 완료 후 질문권 +1. 네이티브 앱(AdMob)은 구글의 SSV 콜백(app/api/ads/ssv)만
// 이 함수를 불러야 신뢰할 수 있다 — 앱이 광고 종료 후 이 자리를 직접 부르게 두면(과거
// 방식) 조작된 클라이언트가 광고 없이도 호출할 수 있다. 웹의 AdSense 타이머 경로
// (app/api/ads/reward)는 검증 수단이 없는 플레이스홀더라 클라이언트 신고를 그대로 믿는다
// — 실제 광고 계정이 붙기 전까지는 감수하는 한계다.
export async function grantAdCredit(owner: Owner) {
  await prisma.adCredit.upsert({
    where: ownerWhere(owner),
    update: { credits: { increment: 1 } },
    create: { ...ownerCreateData(owner), credits: 1 },
  });
}
