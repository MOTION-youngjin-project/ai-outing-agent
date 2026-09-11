import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { GUEST_COOKIE, guestHash } from "@/lib/recommendation-owner";
import { readRecommendation } from "@/lib/services/recommendation-history";

export const runtime = "nodejs";

// /recommend/[runId] 페이지의 새로고침/직링크 복원용. 소유자(로그인 계정 또는 추천을 만든
// 브라우저)가 아니어도 결과 자체는 보여주고, isOwner=false로 내려서 클라이언트가 저장·삭제·
// 재요청 같은 소유자 전용 동작만 감춘다 — 링크 공유는 되게 하되 남의 이력은 못 건드리게.
export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const session = await auth();

  try {
    const data = await readRecommendation(
      runId,
      session?.user?.id,
      guestHash(request.cookies.get(GUEST_COOKIE)?.value)
    );
    if (!data) {
      return NextResponse.json({ error: "추천이 없거나 만료되었습니다." }, { status: 404 });
    }
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("추천 결과 재조회 실패", error);
    return NextResponse.json({ error: "추천 결과 조회에 실패했습니다." }, { status: 500 });
  }
}
