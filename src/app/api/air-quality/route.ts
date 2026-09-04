import { apiError } from "../../../lib/api";
import { ExternalApiError } from "../../../lib/external/public-data";
import { resolveExternalRegion } from "../../../lib/external/resolve-region";
import { getCachedAirQuality } from "../../../lib/services/airQuality";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const resolved = await resolveExternalRegion(new URL(request.url).searchParams);
    const airQuality = await getCachedAirQuality(resolved.externalRegionName);
    if (!airQuality) {
      return apiError(502, "AIR_QUALITY_UNAVAILABLE", "대기질 데이터를 가져오지 못했습니다.");
    }
    return Response.json({
      data: {
        source: "AIRKOREA",
        cache: airQuality.freshnessStatus === "fresh" ? "fresh" : "stale",
        snapshot: airQuality,
        regionId: resolved.regionId?.toString() ?? null,
        requestedRegionName: resolved.requestedRegionName,
      },
    });
  } catch (error) {
    if (error instanceof ExternalApiError) return apiError(error.status, error.code, error.message);
    console.error("대기질 조회 실패", error);
    return apiError(500, "INTERNAL_ERROR", "대기질 조회에 실패했습니다.");
  }
}
