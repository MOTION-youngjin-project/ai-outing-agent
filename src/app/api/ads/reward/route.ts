import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { grantAdCredit, loadAdQuota, type Owner } from "@/lib/ads/quota";
import { GUEST_COOKIE, guestHash, guestToken } from "@/lib/recommendation-owner";

// 웹의 AdSense 타이머 완료 후 호출한다. 로그인 없이도(게스트) 쓸 수 있다 — 이 쿠키가
// 곧 게스트의 질문권 지갑 키다.
// 네이티브 앱(AdMob 리워드 광고)은 더 이상 이 엔드포인트를 쓰지 않는다 — 구글의 SSV
// 콜백(app/api/ads/ssv)이 직접 크레딧을 지급한다. 여기는 실제 광고 시청을 검증할 방법이
// 없는 AdSense 플레이스홀더 전용 경로라 클라이언트 신고를 그대로 믿는다.
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
