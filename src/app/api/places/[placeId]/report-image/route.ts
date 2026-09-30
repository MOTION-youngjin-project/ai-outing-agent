import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 지금 화면에 보이는 대표사진(숨김 안 된 것 중 sortOrder 1등)을 신고한다. 갤러리 전체를
// 대상으로 개별 사진 id를 받지 않는 이유 — DetailScreen이 대표사진 하나만 보여주므로
// 신고 버튼도 그 하나만 대상으로 하면 충분하고, imageId를 클라이언트까지 노출/검증할
// 필요가 없다. 로그인 여부와 무관하게 받는다(신고 문턱을 낮춰야 실제로 걸린다) —
// reporterUserId는 있으면만 채운다.
export async function POST(request: Request, { params }: { params: Promise<{ placeId: string }> }) {
  const { placeId } = await params;
  const place = await prisma.place.findUnique({ where: { publicId: placeId } });
  if (!place) {
    return NextResponse.json({ error: "존재하지 않는 장소입니다." }, { status: 404 });
  }

  const image = await prisma.placeImage.findFirst({
    where: { placeId: place.id, hiddenAt: null },
    orderBy: { sortOrder: "asc" },
  });
  if (!image) {
    return NextResponse.json({ error: "신고할 사진이 없습니다." }, { status: 404 });
  }

  const session = await auth();
  const reporterUserId = session?.user?.id ? BigInt(session.user.id) : null;

  await prisma.placeImageReport.create({
    data: { placeImageId: image.id, reporterUserId },
  });

  return NextResponse.json({ reported: true });
}
