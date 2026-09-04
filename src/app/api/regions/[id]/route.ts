import { apiError, parsePositiveBigInt } from "../../../../lib/api";
import { prisma } from "../../../../lib/prisma";
import { serializeRegion } from "../../../../lib/db/region";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const regionId = parsePositiveBigInt(id);

    if (regionId === null) {
      return apiError(400, "INVALID_REGION_ID", "지역 ID는 양의 정수여야 합니다.");
    }

    const region = await prisma.region.findUnique({
      where: { id: regionId },
      include: {
        parent: true,
        children: { orderBy: { name: "asc" } },
      },
    });

    if (!region) {
      return apiError(404, "REGION_NOT_FOUND", "지역을 찾을 수 없습니다.");
    }

    return Response.json({
      data: {
        ...serializeRegion(region),
        parent: region.parent ? serializeRegion(region.parent) : null,
        children: region.children.map(serializeRegion),
      },
    });
  } catch (error) {
    console.error("region 상세 조회 실패", error);
    return apiError(500, "INTERNAL_ERROR", "지역 상세 조회에 실패했습니다.");
  }
}
