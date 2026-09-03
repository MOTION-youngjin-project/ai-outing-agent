import { NextRequest, NextResponse } from "next/server";
import { getDaeguParking, DAEGU_DISTRICTS } from "@/lib/tools/parking";

export async function GET(req: NextRequest) {
  const district = req.nextUrl.searchParams.get("district") ?? "";

  if (!DAEGU_DISTRICTS.includes(district as (typeof DAEGU_DISTRICTS)[number])) {
    return NextResponse.json(
      { error: "district는 대구광역시 구/군 중 하나여야 합니다." },
      { status: 400 }
    );
  }

  try {
    const spots = await getDaeguParking(district);
    return NextResponse.json({ spots });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "주차장 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}
