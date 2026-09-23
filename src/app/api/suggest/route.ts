import { NextRequest, NextResponse } from "next/server";
import { suggestNextMessage, type ChatTurn } from "@/lib/agent";
import { auth } from "@/lib/auth";
import { loadAdQuota, type Owner } from "@/lib/ads/quota";
import { GUEST_COOKIE, guestHash } from "@/lib/recommendation-owner";

export async function POST(req: NextRequest) {
  const { history } = await req.json();

  if (!Array.isArray(history)) {
    return NextResponse.json({ error: "history가 필요합니다." }, { status: 400 });
  }

  try {
    // 이 라우트도 모델을 태운다. 차감은 하지 않지만(추천이 아니라 보조 기능이다) 오늘
    // 무료도 없고 질문권도 없는 사용자가 계속 모델을 태우는 건 막는다. 비로그인
    // 게스트도 쓸 수 있다 — 아직 광고 한 번도 안 본 게스트는 쿠키가 없어서 자연히 통과.
    const session = await auth();
    const userId = session?.user?.id;
    const sessionKeyHash = userId ? null : guestHash(req.cookies.get(GUEST_COOKIE)?.value);
    const owner: Owner = userId ? { userId } : { sessionKeyHash: sessionKeyHash ?? "" };
    const quota = await loadAdQuota(owner);
    if (!quota.freeAvailableToday && quota.credits <= 0) return NextResponse.json({ suggestion: "" });

    const suggestion = await suggestNextMessage(history as ChatTurn[]);
    return NextResponse.json({ suggestion });
  } catch {
    // 보조 기능이라 실패해도 200으로 빈 제안을 돌려준다.
    return NextResponse.json({ suggestion: "" });
  }
}
