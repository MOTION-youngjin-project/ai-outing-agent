import { prisma } from "@/lib/prisma";
import { normalizeSido, SIDO_LATLON, latLonToGrid } from "@/lib/region";
import { fetchWeather, latestBaseDateTime } from "@/lib/tools/weather";
import { findOrCreateSidoRegion, getOrCreateDataSource } from "./shared";

export interface CachedWeather {
  id: string;
  temperatureC: number | null;
  precipitationProbability: number | null;
  summary: string;
  freshnessStatus: "fresh" | "stale";
  cacheHit: boolean;
  hourly: HourlyWeather[];
}

export interface HourlyWeather {
  forecastAt: string;
  temperatureC: number | null;
  precipitationProbability: number | null;
  summary: string;
}

function kstDateTime(dateStr: string, timeStr: string): Date {
  const y = dateStr.slice(0, 4);
  const m = dateStr.slice(4, 6);
  const d = dateStr.slice(6, 8);
  const hh = timeStr.slice(0, 2);
  const mm = timeStr.slice(2, 4);
  return new Date(`${y}-${m}-${d}T${hh}:${mm}:00+09:00`);
}

function toSummary(sky: string, pty: string): string {
  return pty !== "없음" ? `${sky}, 강수형태 ${pty}` : sky;
}

function findHourlyRows(regionId: bigint, fetchedAt: Date) {
  return prisma.weatherSnapshot.findMany({ where: { regionId, fetchedAt }, orderBy: { forecastAt: "asc" }, take: 12 });
}

function serializeHourly(rows: Awaited<ReturnType<typeof findHourlyRows>>): HourlyWeather[] {
  return rows.map((row) => ({ forecastAt: row.forecastAt.toISOString(), temperatureC: row.temperatureC ? row.temperatureC.toNumber() : null, precipitationProbability: row.precipitationProbability ? row.precipitationProbability.toNumber() : null, summary: row.summary ?? "정보없음" }));
}

// 기상청 도구(get_weather)와 같은 API를 캐시-어사이드로 감싼다.
// 신선도 기준: 마지막으로 받아온 시각이 "현재 유효한 발표시각" 이후인가 — 새 발표
// 주기가 시작됐으면(예: 14시 발표 이후) 11시 발표 기준으로 저장된 캐시는 stale.
export async function getCachedWeather(regionName: string): Promise<CachedWeather | null> {
  const sidoName = normalizeSido(regionName);
  if (!sidoName) return null;

  const region = await findOrCreateSidoRegion(sidoName);
  const latest = await prisma.weatherSnapshot.findFirst({
    where: { regionId: region.id },
    orderBy: [{ fetchedAt: "desc" }, { forecastAt: "asc" }],
  });

  const { base_date, base_time } = latestBaseDateTime(new Date());
  const currentCycleStart = kstDateTime(base_date, base_time);
  const isFresh = latest ? latest.fetchedAt >= currentCycleStart : false;

  if (latest && isFresh) {
    const hourly = serializeHourly(await findHourlyRows(region.id, latest.fetchedAt));
    return {
      id: latest.id.toString(),
      temperatureC: latest.temperatureC ? latest.temperatureC.toNumber() : null,
      precipitationProbability: latest.precipitationProbability
        ? latest.precipitationProbability.toNumber()
        : null,
      summary: latest.summary ?? "",
      freshnessStatus: "fresh",
      cacheHit: true,
      hourly,
    };
  }

  try {
    const { lat, lon } = SIDO_LATLON[sidoName];
    const { nx, ny } = latLonToGrid(lat, lon);
    const fetched = await fetchWeather(nx, ny);
    const source = await getOrCreateDataSource("KMA", "기상청", "open_api");

    const fetchedAt = new Date();
    await prisma.weatherSnapshot.createMany({
      data: fetched.hourly.map((hour) => ({
        sourceId: source.id,
        regionId: region.id,
        forecastAt: kstDateTime(hour.fcstDate, hour.fcstTime),
        temperatureC: hour.tmp ? Number(hour.tmp) : null,
        precipitationProbability: hour.pop ? Number(hour.pop) : null,
        summary: toSummary(hour.sky, hour.pty),
        freshnessStatus: "fresh",
        fetchedAt,
      })),
    });
    const saved = await prisma.weatherSnapshot.findFirstOrThrow({ where: { regionId: region.id, fetchedAt }, orderBy: { forecastAt: "asc" } });
    const temperatureC = saved.temperatureC ? saved.temperatureC.toNumber() : null;
    const precipitationProbability = saved.precipitationProbability ? saved.precipitationProbability.toNumber() : null;
    const summary = saved.summary ?? "정보없음";
    const hourly = serializeHourly(await findHourlyRows(region.id, fetchedAt));

    return {
      id: saved.id.toString(),
      temperatureC,
      precipitationProbability,
      summary,
      freshnessStatus: "fresh",
      cacheHit: false,
      hourly,
    };
  } catch {
    if (!latest) return null;
    return {
      id: latest.id.toString(),
      temperatureC: latest.temperatureC ? latest.temperatureC.toNumber() : null,
      precipitationProbability: latest.precipitationProbability
        ? latest.precipitationProbability.toNumber()
        : null,
      summary: latest.summary ?? "",
      freshnessStatus: "stale",
      cacheHit: false,
      hourly: serializeHourly(await findHourlyRows(region.id, latest.fetchedAt)),
    };
  }
}
