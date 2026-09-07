import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { name, currentPassword, newPassword } = await request.json();
  const userId = BigInt(session.user.id);
  const data: { name?: string; passwordHash?: string } = {};

  if (typeof name === "string") {
    data.name = name.trim() || undefined;
  }

  if (newPassword !== undefined) {
    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return NextResponse.json({ error: "현재 비밀번호와 새 비밀번호를 모두 입력해주세요." }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "새 비밀번호는 8자 이상이어야 합니다." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return NextResponse.json({ error: "현재 비밀번호가 올바르지 않습니다." }, { status: 400 });
    }
    data.passwordHash = await bcrypt.hash(newPassword, 10);
  }

  const updated = await prisma.user.update({ where: { id: userId }, data });
  return NextResponse.json({ name: updated.name });
}
