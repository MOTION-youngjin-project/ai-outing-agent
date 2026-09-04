import { NextResponse } from "next/server";
import { apiError, parsePositiveBigInt } from "../../../lib/api";
import { prisma } from "../../../lib/prisma";
import { serializeRegion } from "../../../lib/db/region";

export const runtime = "nodejs";

const REGION_LEVELS = new Set(["sido", "sigungu", "eupmyeondong"]);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const level = searchParams.get("level")?.trim();
    const parentIdParam = searchParams.get("parentId")?.trim();
    const search = searchParams.get("search")?.trim();
    if (level && !REGION_LEVELS.has(level)) return apiError(400, "INVALID_LEVEL", "level 값이 올바르지 않습니다.");
    const parentId = parentIdParam ? parsePositiveBigInt(parentIdParam) : undefined;
    if (parentIdParam && parentId === null) return apiError(400, "INVALID_PARENT_ID", "parentId는 양의 정수여야 합니다.");
    if (search && search.length > 100) return apiError(400, "INVALID_SEARCH", "search는 100자 이하여야 합니다.");
    const rows = await prisma.region.findMany({
      where: {
        ...(level ? { level } : {}),
        ...(parentId !== undefined && parentId !== null ? { parentId } : {}),
        ...(search ? { name: { contains: search } } : {}),
      },
      orderBy: [{ level: "asc" }, { name: "asc" }],
    });

    const data = rows.map(serializeRegion);

    return NextResponse.json({ count: data.length, data });
  } catch (error) {
    console.error("regions 조회 실패", error);
    return NextResponse.json(
      { error: "지역 목록 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}
