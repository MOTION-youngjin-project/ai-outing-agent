import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "id는 숫자여야 합니다." }, { status: 400 });
  }

  try {
    const region = await prisma.region.findUnique({ where: { id: BigInt(id) } });

    if (!region) {
      return NextResponse.json({ error: "지역을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        ...region,
        id: region.id.toString(),
        parentId: region.parentId?.toString() ?? null,
      },
    });
  } catch (error) {
    console.error("region 단건 조회 실패", error);
    return NextResponse.json({ error: "지역 조회에 실패했습니다." }, { status: 500 });
  }
}
