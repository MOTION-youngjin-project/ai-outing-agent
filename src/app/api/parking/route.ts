import { NextRequest, NextResponse } from "next/server";
import { getDaeguParking, getDaeguParkingNearby, DAEGU_DISTRICTS, haversineMeters, estimateWalkMinutes } from "@/lib/tools/parking";
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
    // placeName이 있으면 목적지 좌표를 먼저 찾아서, 그 좌표 기준으로 실제 가장 가까운
    // 5곳을 고른다(getDaeguParkingNearby). 못 찾으면(카카오 검색 결과 없음/placeName
    // 없음) 좌표 기준 정렬이 불가능하니 기존처럼 실시간 연동 우선 5곳(getDaeguParking).
    const destination = placeName ? await resolvePlaceByName(placeName, district) : null;
    if (!destination) {
      // 카카오가 이 장소 이름을 못 찾은 경우(예: "사문진 주막촌 및 나루터") — 거리 계산이
      // 안 되니 distanceMeters/walkMinutes는 null로 채워서 클라이언트 타입과 맞춘다.
      // 지도는 못 그려도 이 구의 대표 주차장 목록 자체는 유효한 데이터라 그대로 내려준다.
      const spots = (await getDaeguParking(district)).map((s) => ({
        ...s,
        distanceMeters: null,
        walkMinutes: null,
      }));
      return NextResponse.json({ spots, destination: null });
    }

    const origin = { latitude: destination.latitude.toNumber(), longitude: destination.longitude.toNumber() };
    const spots = await getDaeguParkingNearby(district, origin);
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
