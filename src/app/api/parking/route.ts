import { NextRequest, NextResponse } from "next/server";
import { getDaeguParking, DAEGU_DISTRICTS, haversineMeters, estimateWalkMinutes } from "@/lib/tools/parking";
import { resolvePlaceByName } from "@/lib/services/places";

export async function GET(req: NextRequest) {
  const district = req.nextUrl.searchParams.get("district") ?? "";
  const placeName = req.nextUrl.searchParams.get("placeName");

  if (!DAEGU_DISTRICTS.includes(district as (typeof DAEGU_DISTRICTS)[number])) {
    return NextResponse.json(
      { error: "district는 대구광역시 구/군 중 하나여야 합니다." },
      { status: 400 }
    );
  }

  try {
    const spots = await getDaeguParking(district);

    // placeName이 있으면 목적지 좌표를 찾아 거리/도보시간을 계산해 가까운 순으로 정렬한다.
    // 못 찾으면(카카오 검색 결과 없음) 거리 정보 없이 원래 순서 그대로 반환.
    const destination = placeName ? await resolvePlaceByName(placeName, district) : null;
    if (!destination) {
      return NextResponse.json({ spots, destination: null });
    }

    const origin = { latitude: destination.latitude.toNumber(), longitude: destination.longitude.toNumber() };
    const withDistance = spots
      .map((s) => {
        if (s.latitude === null || s.longitude === null) {
          return { ...s, distanceMeters: null, walkMinutes: null };
        }
        const distanceMeters = Math.round(
          haversineMeters(origin, { latitude: s.latitude, longitude: s.longitude })
        );
        return { ...s, distanceMeters, walkMinutes: estimateWalkMinutes(distanceMeters) };
      })
      .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));

    return NextResponse.json({ spots: withDistance, destination: origin });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "주차장 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}
