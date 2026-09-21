import { NextRequest, NextResponse } from "next/server";
import { suggestNextMessage, type ChatTurn } from "@/lib/agent";
import { auth } from "@/lib/auth";
import { loadBalance } from "@/lib/billing/quota";
import { canAffordNext } from "@/lib/billing/plans";

export async function POST(req: NextRequest) {
  const { history } = await req.json();

  if (!Array.isArray(history)) {
    return NextResponse.json({ error: "history가 필요합니다." }, { status: 400 });
  }

  try {
    // 이 라우트도 모델을 태운다. 차감은 하지 않지만(추천이 아니라 보조 기능이다) 잔액이
    // 없는 사용자가 계속 모델을 태우는 건 막는다. 여기서는 자동충전을 시도하지 않는다 —
    // 보조 기능 하나 때문에 카드가 긁히면 안 된다(자동충전은 recommend 게이트에서만).
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ suggestion: "" });
    const balance = await loadBalance(session.user.id);
    if (!canAffordNext(balance)) return NextResponse.json({ suggestion: "" });

    const suggestion = await suggestNextMessage(history as ChatTurn[]);
    return NextResponse.json({ suggestion });
  } catch {
    // 보조 기능이라 실패해도 200으로 빈 제안을 돌려준다.
    return NextResponse.json({ suggestion: "" });
  }
}
