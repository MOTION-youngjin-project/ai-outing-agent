import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listRecommendations } from "@/lib/services/recommendation-history";
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    return NextResponse.json({ data: await listRecommendations(session.user.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "추천 기록을 불러오지 못했습니다." }, { status: 500 });
  }
}
