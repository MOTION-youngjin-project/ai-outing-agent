import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { grantAdCredit, loadAdQuota } from "@/lib/ads/quota";

// 광고 시청 완료 후 호출한다(웹은 타이머 완료 시, 앱은 AdMob 리워드 콜백 이후).
// ponytail: 지금은 이 호출 자체를 신뢰한다 — SSV(서버 검증)는 실제 광고 SDK를
// 붙인 뒤에 해야 한다.
export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  await grantAdCredit(userId);
  const quota = await loadAdQuota(userId);
  return NextResponse.json({ credits: quota.credits });
}
