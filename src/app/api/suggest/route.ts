import { NextRequest, NextResponse } from "next/server";
import { followUpSuggestion } from "@/lib/follow-up-suggestion";
import { auth } from "@/lib/auth";
import { loadBalance } from "@/lib/billing/quota";
import { canAffordNext } from "@/lib/billing/plans";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const history = body?.history;

  if (!Array.isArray(history) || history.length > 50 || history.some(h => !h || !["user", "assistant"].includes(h.role) || typeof h.content !== "string" || h.content.length > 10000)) {
    return NextResponse.json({ error: "history가 필요합니다." }, { status: 400 });
  }

  try {
    // Suggestions are local rules. Preserve the existing login/balance gate without charging.
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ suggestion: "" });
    const balance = await loadBalance(session.user.id);
    if (!canAffordNext(balance)) return NextResponse.json({ suggestion: "" });

    const suggestion = followUpSuggestion(history);
    return NextResponse.json({ suggestion });
  } catch {
    // 보조 기능이라 실패해도 200으로 빈 제안을 돌려준다.
    return NextResponse.json({ suggestion: "" });
  }
}
