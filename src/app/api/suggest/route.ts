import { NextRequest, NextResponse } from "next/server";
import { suggestNextMessage, type ChatTurn } from "@/lib/agent";
import { auth } from "@/lib/auth";
import { loadAdQuota } from "@/lib/ads/quota";

export async function POST(req: NextRequest) {
  const { history } = await req.json();

  if (!Array.isArray(history)) {
    return NextResponse.json({ error: "history가 필요합니다." }, { status: 400 });
  }

  try {
    // 이 라우트도 모델을 태운다. 차감은 하지 않지만(추천이 아니라 보조 기능이다) 오늘
    // 무료도 없고 질문권도 없는 사용자가 계속 모델을 태우는 건 막는다.
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ suggestion: "" });
    const quota = await loadAdQuota(session.user.id);
    if (!quota.freeAvailableToday && quota.credits <= 0) return NextResponse.json({ suggestion: "" });

    const suggestion = await suggestNextMessage(history as ChatTurn[]);
    return NextResponse.json({ suggestion });
  } catch {
    // 보조 기능이라 실패해도 200으로 빈 제안을 돌려준다.
    return NextResponse.json({ suggestion: "" });
  }
}
