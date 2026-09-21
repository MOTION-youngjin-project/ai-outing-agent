import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadAdQuota } from "@/lib/ads/quota";

// 앱(웹뷰) 쪽 네이티브 리워드 광고는 시청 완료 후 앱이 직접 /api/ads/reward를
// 호출한다 — 웹 페이지는 그 결과를 모르므로, 광고 화면에서 복귀했을 때 이걸로
// 잔액을 다시 조회해 화면을 갱신한다.
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const quota = await loadAdQuota(userId);
  return NextResponse.json(quota);
}
