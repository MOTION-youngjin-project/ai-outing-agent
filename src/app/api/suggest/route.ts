import { NextRequest, NextResponse } from "next/server";
import { suggestNextMessage, type ChatTurn } from "@/lib/agent";
import { auth } from "@/lib/auth";
import { GUEST_COOKIE, guestHash } from "@/lib/recommendation-owner";
import { loadQuota } from "@/lib/billing/quota";

export async function POST(req: NextRequest) {
  const { history } = await req.json();

  if (!Array.isArray(history)) {
    return NextResponse.json({ error: "history가 필요합니다." }, { status: 400 });
  }

  try {
    // 이 라우트도 모델을 태운다. 차감은 하지 않지만(추천이 아니라 보조 기능이다) 한도를
    // 다 쓴 사용자가 계속 모델을 태우는 건 막는다 — 쿼터 판정은 recommend와 같은
    // loadQuota 하나를 통과한다(라우트마다 가드를 복붙하지 않는다).
    // 여기선 쿠키를 새로 발급하지 않는다 — 게스트 식별자를 만드는 건 추천 라우트의 일이고,
    // 아직 쿠키가 없는 게스트는 자연히 통과한다(그 게스트는 아직 한 번도 안 썼다).
    const session = await auth();
    const quota = await loadQuota(session?.user?.id ?? null, guestHash(req.cookies.get(GUEST_COOKIE)?.value));
    if (!quota.allowed) return NextResponse.json({ suggestion: "" });

    const suggestion = await suggestNextMessage(history as ChatTurn[]);
    return NextResponse.json({ suggestion });
  } catch {
    // 보조 기능이라 실패해도 200으로 빈 제안을 돌려준다.
    return NextResponse.json({ suggestion: "" });
  }
}
