import { NextRequest, NextResponse } from "next/server";
import { getParkingSpotById, DAEGU_DISTRICTS } from "@/lib/tools/parking";
import { resolvePlaceByName } from "@/lib/services/places";
import { parseCoordinateQuery } from "@/lib/coordinates";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ pkltId: string }> }
) {
  const { pkltId } = await params;
  const district = req.nextUrl.searchParams.get("district") ?? "";
  const placeName = req.nextUrl.searchParams.get("placeName");

  if (!DAEGU_DISTRICTS.includes(district as (typeof DAEGU_DISTRICTS)[number])) {
    return NextResponse.json(
      { error: "district는 대구광역시 구/군 중 하나여야 합니다." },
      { status: 400 }
    );
  }

  let point;
  try { point = parseCoordinateQuery(req.nextUrl.searchParams); }
  catch { return NextResponse.json({ error: "유효한 위도·경도 쌍이 필요합니다." }, { status: 400 }); }
  try {
    // /api/parking과 같은 방식: placeName이 있으면 목적지 좌표를 다시 찾아 거리를 계산한다.
    const destination = !point && placeName ? await resolvePlaceByName(placeName, district) : null;
    const origin = point ?? (destination
      ? { latitude: destination.latitude.toNumber(), longitude: destination.longitude.toNumber() }
      : null);

    const spot = await getParkingSpotById(district, pkltId, origin);
    if (!spot) {
      return NextResponse.json({ error: "주차장을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ data: spot });
  } catch {
    return NextResponse.json(
      { error: "주차장 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}
