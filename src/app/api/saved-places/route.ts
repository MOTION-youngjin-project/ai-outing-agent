import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const saved = await prisma.savedPlace.findMany({
    where: { userId: BigInt(session.user.id) },
    orderBy: { createdAt: "desc" },
    include: { place: true },
  });

  const data = saved.map((s) => ({
    placeId: s.place.publicId,
    name: s.place.name,
    categorySummary: s.place.categorySummary,
    roadAddress: s.place.roadAddress,
  }));

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { placeId } = await request.json();
  if (typeof placeId !== "string") {
    return NextResponse.json({ error: "placeId가 필요합니다." }, { status: 400 });
  }

  const place = await prisma.place.findUnique({ where: { publicId: placeId } });
  if (!place) {
    return NextResponse.json({ error: "존재하지 않는 장소입니다." }, { status: 404 });
  }

  await prisma.savedPlace.upsert({
    where: { userId_placeId: { userId: BigInt(session.user.id), placeId: place.id } },
    create: { userId: BigInt(session.user.id), placeId: place.id },
    update: {},
  });

  return NextResponse.json({ saved: true });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const placeId = request.nextUrl.searchParams.get("placeId");
  if (!placeId) {
    return NextResponse.json({ error: "placeId가 필요합니다." }, { status: 400 });
  }

  const place = await prisma.place.findUnique({ where: { publicId: placeId } });
  if (!place) {
    return NextResponse.json({ saved: false });
  }

  await prisma.savedPlace
    .delete({ where: { userId_placeId: { userId: BigInt(session.user.id), placeId: place.id } } })
    .catch(() => null);

  return NextResponse.json({ saved: false });
}
