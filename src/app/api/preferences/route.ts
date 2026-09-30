import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLACE_TAGS } from "@/lib/agent";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: BigInt(session.user.id) } });
  return NextResponse.json({ tags: (user?.preferredTags as string[] | null) ?? [] });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { tags } = await request.json();
  if (!Array.isArray(tags) || !tags.every((t) => PLACE_TAGS.includes(t))) {
    return NextResponse.json({ error: `tags는 ${PLACE_TAGS.join("/")} 중에서만 고를 수 있습니다.` }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: BigInt(session.user.id) },
    data: { preferredTags: tags },
  });

  return NextResponse.json({ tags });
}
