import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadAdQuota, type Owner } from "@/lib/ads/quota";
import { GUEST_COOKIE, guestHash } from "@/lib/recommendation-owner";

// 앱(웹뷰) 쪽 네이티브 리워드 광고는 시청 완료 후 앱이 직접 /api/ads/reward를
// 호출한다 — 웹 페이지는 그 결과를 모르므로, 광고 화면에서 복귀했을 때 이걸로
// 잔액을 다시 조회해 화면을 갱신한다. 로그인 없이도(게스트) 쓸 수 있다.
export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  const sessionKeyHash = userId ? null : guestHash(req.cookies.get(GUEST_COOKIE)?.value);
  const owner: Owner = userId ? { userId } : { sessionKeyHash: sessionKeyHash ?? "" };

  const quota = await loadAdQuota(owner);
  return NextResponse.json(quota);
}
