import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCachedWeather } from "@/lib/services/weather";

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

  try {
    const weather = await getCachedWeather(regionName);
    if (!weather) {
      return NextResponse.json({ error: "지원하지 않는 지역입니다." }, { status: 400 });
    }

    const { cacheHit, ...data } = weather;
    const cache = regionIdParam === null ? "bypass" : cacheHit ? "hit" : "miss";
    return NextResponse.json({ data: { ...data, cache } });
  } catch (error) {
    console.error("날씨 조회 실패", error);
    return NextResponse.json({ error: "날씨 조회에 실패했습니다." }, { status: 503 });
  }
}
