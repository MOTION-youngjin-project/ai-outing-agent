import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCachedAirQuality } from "@/lib/services/airQuality";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const regionIdParam = searchParams.get("regionId");
  const regionParam = searchParams.get("region");

  if (regionIdParam !== null && !/^\d+$/.test(regionIdParam)) {
    return NextResponse.json({ error: "regionId는 숫자여야 합니다." }, { status: 400 });
  }

  let regionName: string | null = regionParam;
  if (regionIdParam !== null) {
    const region = await prisma.region.findUnique({ where: { id: BigInt(regionIdParam) } });
    if (!region) {
      return NextResponse.json({ error: "해당 regionId의 지역을 찾을 수 없습니다." }, { status: 400 });
    }
    regionName = region.name;
  }

  if (!regionName) {
    return NextResponse.json({ error: "regionId 또는 region 파라미터가 필요합니다." }, { status: 400 });
  }

  if (!process.env.AIRKOREA_API_KEY) {
    return NextResponse.json({ error: "AIRKOREA_API_KEY가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    const airQuality = await getCachedAirQuality(regionName);
    if (!airQuality) {
      return NextResponse.json({ error: "지원하지 않는 지역입니다." }, { status: 400 });
    }

    const { cacheHit, ...data } = airQuality;
    const cache = regionIdParam === null ? "bypass" : cacheHit ? "hit" : "miss";
    return NextResponse.json({ data: { ...data, cache } });
  } catch (error) {
    console.error("대기질 조회 실패", error);
    return NextResponse.json({ error: "대기질 조회에 실패했습니다." }, { status: 503 });
  }
}
