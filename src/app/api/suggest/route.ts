import { NextRequest, NextResponse } from "next/server";
import { followUpSuggestion } from "@/lib/follow-up-suggestion";
import { auth } from "@/lib/auth";
import { loadAdQuota, type Owner } from "@/lib/ads/quota";
import { GUEST_COOKIE, guestHash } from "@/lib/recommendation-owner";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const history = body?.history;

  if (!Array.isArray(history) || history.length > 50 || history.some(h => !h || !["user", "assistant"].includes(h.role) || typeof h.content !== "string" || h.content.length > 10000)) {
    return NextResponse.json({ error: "history가 필요합니다." }, { status: 400 });
  }

  try {
    // 제안은 이제 로컬 규칙이라 모델을 태우지 않지만, 기존 게이트(오늘 무료도 질문권도
    // 없으면 빈 제안)는 그대로 둔다 — 차감은 하지 않는다.
    const session = await auth();
    const userId = session?.user?.id;
    const sessionKeyHash = userId ? null : guestHash(req.cookies.get(GUEST_COOKIE)?.value);
    const owner: Owner = userId ? { userId } : { sessionKeyHash: sessionKeyHash ?? "" };
    const quota = await loadAdQuota(owner);
    if (!quota.freeAvailableToday && quota.credits <= 0) return NextResponse.json({ suggestion: "" });

    const suggestion = followUpSuggestion(history);
    return NextResponse.json({ suggestion });
  } catch {
    // 보조 기능이라 실패해도 200으로 빈 제안을 돌려준다.
    return NextResponse.json({ suggestion: "" });
  }
}
