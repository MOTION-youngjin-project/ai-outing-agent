import { NextResponse } from "next/server";
import { searchAndCachePlaces } from "@/lib/services/places";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");

  if (!query || query.length > 100) {
    return NextResponse.json({ error: "query 파라미터가 필요합니다(최대 100자)." }, { status: 400 });
  }

  if (!process.env.KAKAO_API_KEY) {
    return NextResponse.json({ error: "KAKAO_API_KEY가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    const data = await searchAndCachePlaces(query);
    return NextResponse.json({ count: data.length, data });
  } catch (error) {
    console.error("장소 검색 실패", error);
    return NextResponse.json({ error: "장소 검색에 실패했습니다." }, { status: 502 });
  }
}
