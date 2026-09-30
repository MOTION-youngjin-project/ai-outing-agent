import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  // ?planned=1이면 방문 예정일이 있는 것만 날짜순(가까운 날 먼저) — 마이페이지 > 방문 예정용.
  const plannedOnly = request.nextUrl.searchParams.get("planned") === "1";

  const saved = await prisma.savedPlace.findMany({
    where: {
      userId: BigInt(session.user.id),
      ...(plannedOnly ? { plannedVisitAt: { not: null } } : {}),
    },
    orderBy: plannedOnly ? { plannedVisitAt: "asc" } : { createdAt: "desc" },
    include: { place: { include: { images: { where: { isPrimary: true }, take: 1 } } } },
  });

  const data = saved.map((s) => ({
    placeId: s.place.publicId,
    name: s.place.name,
    categorySummary: s.place.categorySummary,
    roadAddress: s.place.roadAddress,
    imageUrl: s.place.images[0]?.thumbnailUrl ?? s.place.images[0]?.originalUrl ?? null,
    // "2026-09-20" 형태로만 내려보낸다 — 시각은 안 받으므로 타임존 해석이 끼어들 여지를 없앤다.
    plannedVisitAt: s.plannedVisitAt ? s.plannedVisitAt.toISOString().slice(0, 10) : null,
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

// 방문 예정일 지정/해제. 저장하지 않은 장소는 방문 예정으로 만들 수 없다(먼저 저장해야 함).
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { placeId, plannedVisitAt } = await request.json();
  if (typeof placeId !== "string") {
    return NextResponse.json({ error: "placeId가 필요합니다." }, { status: 400 });
  }
  // 신뢰 경계 밖 입력이라 형식을 검증한다 — new Date()는 이상한 문자열도 조용히
  // Invalid Date로 만들어 그대로 DB에 넣으면 터진다.
  if (plannedVisitAt !== null && !/^\d{4}-\d{2}-\d{2}$/.test(plannedVisitAt ?? "")) {
    return NextResponse.json({ error: "plannedVisitAt은 YYYY-MM-DD 또는 null이어야 합니다." }, { status: 400 });
  }
  const parsed = plannedVisitAt === null ? null : new Date(`${plannedVisitAt}T00:00:00Z`);
  if (parsed !== null && Number.isNaN(parsed.getTime())) {
    return NextResponse.json({ error: "존재하지 않는 날짜입니다." }, { status: 400 });
  }

  const place = await prisma.place.findUnique({ where: { publicId: placeId } });
  if (!place) {
    return NextResponse.json({ error: "존재하지 않는 장소입니다." }, { status: 404 });
  }

  const updated = await prisma.savedPlace
    .update({
      where: { userId_placeId: { userId: BigInt(session.user.id), placeId: place.id } },
      data: { plannedVisitAt: parsed },
    })
    .catch(() => null);

  if (!updated) {
    return NextResponse.json({ error: "먼저 이 장소를 저장해주세요." }, { status: 404 });
  }

  return NextResponse.json({ plannedVisitAt });
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
