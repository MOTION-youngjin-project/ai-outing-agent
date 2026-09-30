import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 카드 등록 창을 열기 직전에 부른다. 하는 일은 하나뿐 — 그 사용자의 지갑(Wallet)을
// 확보하고 customerKey를 돌려준다. 플랜 선택이 없다(종량제라 살 "플랜"이 없다).
export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const userIdBigInt = BigInt(userId);

  // customerKey는 한 번 발급하면 그대로 재사용한다 — 빌링키가 이 키에 묶여 있어서
  // 바꾸면 기존 카드가 끊긴다. userId를 그대로 쓰지 않는 이유는 유추 가능한 값을
  // customerKey로 쓰는 걸 토스가 금지하기 때문이다(ANONYMOUS도 빌링키엔 못 쓴다).
  const wallet =
    (await prisma.wallet.findUnique({ where: { userId: userIdBigInt } })) ??
    (await prisma.wallet.create({ data: { userId: userIdBigInt, customerKey: randomUUID() } }));

  return NextResponse.json({ customerKey: wallet.customerKey });
}
