import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteRecommendation } from "@/lib/services/recommendation-history";
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const { id } = await params;
    if (!await deleteRecommendation(id, session.user.id)) return NextResponse.json({ error: "추천 기록을 찾을 수 없습니다." }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "추천 기록을 삭제하지 못했습니다." }, { status: 500 });
  }
}
