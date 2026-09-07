import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export const runtime = "nodejs";

// DB level 값은 한글("시도"/"구군")이지만 프론트 연동 문서는 영문(sido/sigungu)으로 요청하므로
// 두 표기를 모두 받아준다.
const LEVEL_ALIASES: Record<string, string> = { sido: "시도", sigungu: "구군" };

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const levelParam = searchParams.get("level");
    const search = searchParams.get("search");
    const parentIdParam = searchParams.get("parentId");

    if (parentIdParam !== null && !/^\d+$/.test(parentIdParam)) {
      return NextResponse.json({ error: "parentId는 숫자여야 합니다." }, { status: 400 });
    }

    const where: { level?: string; name?: { contains: string }; parentId?: bigint } = {};
    if (levelParam) where.level = LEVEL_ALIASES[levelParam] ?? levelParam;
    if (search) where.name = { contains: search };
    if (parentIdParam !== null) where.parentId = BigInt(parentIdParam);

    const rows = await prisma.region.findMany({
      where,
      orderBy: [{ level: "asc" }, { name: "asc" }],
    });

    const data = rows.map((region) => ({
      ...region,
      id: region.id.toString(),
      parentId: region.parentId?.toString() ?? null,
    }));

    return NextResponse.json({ count: data.length, data });
  } catch (error) {
    console.error("regions 조회 실패", error);
    return NextResponse.json(
      { error: "지역 목록 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}
