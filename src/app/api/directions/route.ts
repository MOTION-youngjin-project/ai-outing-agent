import { NextResponse } from "next/server";
import { fetchDrivingRoutes } from "@/lib/services/naverDirections";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fromLat = Number(searchParams.get("fromLat"));
  const fromLng = Number(searchParams.get("fromLng"));
  const toLat = Number(searchParams.get("toLat"));
  const toLng = Number(searchParams.get("toLng"));

  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
    return NextResponse.json({ error: "fromLat/fromLng/toLat/toLng가 필요합니다." }, { status: 400 });
  }

  try {
    const routes = await fetchDrivingRoutes(
      { latitude: fromLat, longitude: fromLng },
      { latitude: toLat, longitude: toLng }
    );
    return NextResponse.json({ data: routes });
  } catch (error) {
    console.error("자동차 경로 조회 실패", error);
    return NextResponse.json({ error: "경로 조회에 실패했습니다." }, { status: 502 });
  }
}
