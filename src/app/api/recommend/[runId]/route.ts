import { NextResponse } from "next/server";
import { loadRouteSnapshot } from "@/lib/services/routeSnapshot";

export const runtime = "nodejs";

// /recommend/[runId] 페이지의 새로고침/직링크 복원용. agentRunId(UUID)로 그때 저장해둔
// route_places.enriched_snapshot을 그대로 돌려준다 — postRecommend()가 처음 받는 응답과
// 같은 모양(RecommendResult)이라 클라이언트는 어디서 왔든 같은 파서로 처리한다.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  try {
    const result = await loadRouteSnapshot(runId);
    if (!result) {
      return NextResponse.json({ error: "추천 결과를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("추천 결과 재조회 실패", error);
    return NextResponse.json({ error: "추천 결과 조회에 실패했습니다." }, { status: 500 });
  }
}
