import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { GUEST_COOKIE, guestHash } from "@/lib/recommendation-owner";
import { readRecommendation } from "@/lib/services/recommendation-history";

export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const session = await auth();
  try {
    const data = await readRecommendation(runId, session?.user?.id, guestHash(request.cookies.get(GUEST_COOKIE)?.value));
    if (!data) return NextResponse.json({ error: "추천이 없거나 만료되었습니다. 본인 계정 또는 추천한 브라우저에서 확인해 주세요." }, { status: 404 });
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "추천 결과 조회에 실패했습니다." }, { status: 500 });
  }
}
