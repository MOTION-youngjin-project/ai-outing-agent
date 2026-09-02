import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await prisma.region.findMany({
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
