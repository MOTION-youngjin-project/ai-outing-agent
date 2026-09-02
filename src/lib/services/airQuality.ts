import { prisma } from "@/lib/prisma";
import { normalizeSido } from "@/lib/region";
import { fetchAirQuality } from "@/lib/tools/airQuality";
import { findOrCreateSidoRegion, getOrCreateDataSource } from "./shared";

export interface CachedAirQuality {
  pm10Value: number | null;
  overallGrade: string;
  freshnessStatus: "fresh" | "stale";
}

// ponytail: 에어코리아 응답엔 갱신주기가 명시돼 있지 않아 60분 고정 TTL로 잡음.
// 실측 갱신주기가 확인되면 이 값만 조정하면 됨.
const AIR_QUALITY_TTL_MS = 60 * 60 * 1000;

// 에어코리아 도구(get_air_quality)와 같은 API를 캐시-어사이드로 감싼다.
export async function getCachedAirQuality(regionName: string): Promise<CachedAirQuality | null> {
  const sidoName = normalizeSido(regionName);
  if (!sidoName) return null;

  const region = await findOrCreateSidoRegion(sidoName);
  const latest = await prisma.airQualitySnapshot.findFirst({
    where: { regionId: region.id },
    orderBy: { fetchedAt: "desc" },
  });

  const isFresh = latest ? Date.now() - latest.fetchedAt.getTime() < AIR_QUALITY_TTL_MS : false;

  if (latest && isFresh) {
    return {
      pm10Value: latest.pm10Value ? latest.pm10Value.toNumber() : null,
      overallGrade: latest.overallGrade,
      freshnessStatus: "fresh",
    };
  }

  try {
    const { pm10, grade } = await fetchAirQuality(sidoName);
    const source = await getOrCreateDataSource("AIRKOREA", "에어코리아", "open_api");

    await prisma.airQualitySnapshot.create({
      data: {
        sourceId: source.id,
        regionId: region.id,
        pm10Value: pm10,
        overallGrade: grade,
        measuredAt: new Date(),
        freshnessStatus: "fresh",
      },
    });

    return { pm10Value: pm10, overallGrade: grade, freshnessStatus: "fresh" };
  } catch {
    if (!latest) return null;
    return {
      pm10Value: latest.pm10Value ? latest.pm10Value.toNumber() : null,
      overallGrade: latest.overallGrade,
      freshnessStatus: "stale",
    };
  }
}
