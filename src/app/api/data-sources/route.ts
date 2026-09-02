import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await prisma.dataSource.findMany({ orderBy: { id: "asc" } });
    const data = rows.map((row) => ({ ...row, id: row.id.toString() }));

    return NextResponse.json({ count: data.length, data });
  } catch (error) {
    console.error("data_sources 조회 실패", error);
    return NextResponse.json({ error: "data_sources 조회에 실패했습니다." }, { status: 500 });
  }
}
