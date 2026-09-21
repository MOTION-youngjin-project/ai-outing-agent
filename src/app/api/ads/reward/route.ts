import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { grantAdCredit, loadAdQuota, type Owner } from "@/lib/ads/quota";
import { GUEST_COOKIE, guestHash, guestToken } from "@/lib/recommendation-owner";

// 광고 시청 완료 후 호출한다(웹은 타이머 완료 시, 앱은 AdMob 리워드 콜백 이후).
// 로그인 없이도(게스트) 쓸 수 있다 — 이 쿠키가 곧 게스트의 질문권 지갑 키다.
// ponytail: 지금은 이 호출 자체를 신뢰한다 — SSV(서버 검증)는 실제 광고 SDK를
// 붙인 뒤에 해야 한다.
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  const token = userId ? undefined : guestToken(req.cookies.get(GUEST_COOKIE)?.value);
  const owner: Owner = userId ? { userId } : { sessionKeyHash: guestHash(token)! };

  await grantAdCredit(owner);
  const quota = await loadAdQuota(owner);

  const response = NextResponse.json({ credits: quota.credits });
  if (token) response.cookies.set(GUEST_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return response;
}
