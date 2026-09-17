import { NextResponse } from "next/server";
import { getPlaceLifeInfo } from "@/lib/services/life-info";

export async function GET(request: Request, context: RouteContext<"/api/places/[placeId]/life-info">) {
  const { placeId } = await context.params;
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  try {
    const result = await getPlaceLifeInfo(placeId, refresh);
    if (!result) return NextResponse.json({ error: "장소를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error(`생활정보 조회 실패(${placeId}):`, error);
    const message = error instanceof Error && error.message === "NAVER_SEARCH_API_NOT_CONFIGURED"
      ? "생활정보 검색 API가 아직 설정되지 않았습니다."
      : "생활정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
