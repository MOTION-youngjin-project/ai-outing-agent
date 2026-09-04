import { apiError } from "../../../lib/api";
import { ExternalApiError } from "../../../lib/external/public-data";
import { resolveExternalRegion } from "../../../lib/external/resolve-region";
import { getWeather } from "../../../lib/external/weather";
import { prisma } from "../../../lib/prisma";

export const runtime = "nodejs";

const CACHE_TTL_MS = 30 * 60 * 1000;

function serializeSnapshot(snapshot: {
  id: bigint;
  regionId: bigint;
  forecastAt: Date;
  temperatureC: { toString(): string } | null;
  precipitationProbability: { toString(): string } | null;
  precipitationMm: { toString(): string } | null;
  windSpeedMps: { toString(): string } | null;
  summary: string | null;
  fetchedAt: Date;
  freshnessStatus: string;
}) {
  return {
    id: snapshot.id.toString(),
    regionId: snapshot.regionId.toString(),
    forecastAt: snapshot.forecastAt.toISOString(),
    temperatureC: snapshot.temperatureC?.toString() ?? null,
    precipitationProbability: snapshot.precipitationProbability?.toString() ?? null,
    precipitationMm: snapshot.precipitationMm?.toString() ?? null,
    windSpeedMps: snapshot.windSpeedMps?.toString() ?? null,
    summary: snapshot.summary,
    fetchedAt: snapshot.fetchedAt.toISOString(),
    freshnessStatus: snapshot.freshnessStatus,
  };
}

function parseForecastAt(value: string) {
  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  const hour = value.slice(8, 10);
  const minute = value.slice(10, 12);
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:00+09:00`);
}

export async function GET(request: Request) {
  try {
    const resolved = await resolveExternalRegion(new URL(request.url).searchParams);

    if (resolved.regionId !== null) {
      const cached = await prisma.weatherSnapshot.findFirst({
        where: {
          regionId: resolved.regionId,
          fetchedAt: { gte: new Date(Date.now() - CACHE_TTL_MS) },
        },
        orderBy: { fetchedAt: "desc" },
      });
      if (cached) {
        return Response.json({
          data: {
            source: "KMA",
            cache: "hit",
            requestedRegionName: resolved.requestedRegionName,
            snapshot: serializeSnapshot(cached),
          },
        });
      }
    }

    const weather = await getWeather(resolved.externalRegionName);

    if (resolved.regionId !== null) {
      const source = await prisma.dataSource.findUnique({ where: { code: "KMA" } });
      if (!source) throw new ExternalApiError("DATA_SOURCE_NOT_FOUND", "KMA 데이터 제공처가 등록되지 않았습니다.", 500);

      const snapshot = await prisma.weatherSnapshot.create({
        data: {
          sourceId: source.id,
          regionId: resolved.regionId,
          forecastAt: parseForecastAt(weather.forecastAt),
          temperatureC: weather.temperatureC,
          precipitationProbability: weather.precipitationProbability,
          summary: `SKY=${weather.sky ?? ""};PTY=${weather.precipitationType ?? ""}`,
        },
      });
      return Response.json({
        data: {
          source: "KMA",
          cache: "miss",
          requestedRegionName: resolved.requestedRegionName,
          snapshot: serializeSnapshot(snapshot),
        },
      });
    }

    return Response.json({
      data: {
        ...weather,
        cache: "bypass",
        regionId: null,
        requestedRegionName: resolved.requestedRegionName,
      },
    });
  } catch (error) {
    if (error instanceof ExternalApiError) return apiError(error.status, error.code, error.message);
    console.error("날씨 조회 실패", error);
    return apiError(500, "INTERNAL_ERROR", "날씨 조회에 실패했습니다.");
  }
}
