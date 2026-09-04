import { parsePositiveBigInt } from "../api";
import { prisma } from "../prisma";
import { ExternalApiError } from "./public-data";

export async function resolveExternalRegion(searchParams: URLSearchParams) {
  const regionIdParam = searchParams.get("regionId")?.trim();
  const regionNameParam = searchParams.get("region")?.trim();

  if (regionIdParam) {
    const regionId = parsePositiveBigInt(regionIdParam);
    if (regionId === null) {
      throw new ExternalApiError("INVALID_REGION_ID", "regionId는 양의 정수여야 합니다.", 400);
    }

    const region = await prisma.region.findUnique({
      where: { id: regionId },
      include: { parent: true },
    });
    if (!region) throw new ExternalApiError("REGION_NOT_FOUND", "지역을 찾을 수 없습니다.", 404);

    return {
      regionId,
      requestedRegionName: region.name,
      externalRegionName: region.level === "sido" ? region.name : (region.parent?.name ?? region.name),
    };
  }

  if (regionNameParam) {
    return { regionId: null, requestedRegionName: regionNameParam, externalRegionName: regionNameParam };
  }

  throw new ExternalApiError("REGION_REQUIRED", "regionId 파라미터가 필요합니다.", 400);
}
