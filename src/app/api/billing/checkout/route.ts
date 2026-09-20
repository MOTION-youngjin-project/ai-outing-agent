import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parsePlanCode } from "@/lib/billing/plans";

// 카드 등록 창을 열기 직전에 부른다. 하는 일은 딱 둘: 어떤 플랜을 사려는지 서버에
// 적어두고, 그 사용자의 customerKey를 확보해 돌려준다.
//
// 금액은 여기서 받지 않는다 — 클라이언트가 금액을 보낼 입구를 아예 만들지 않으면
// "클라이언트 금액을 믿었다"는 사고가 구조적으로 불가능하다. 승인 시점의 금액은
// 서버가 PLANS[planCode]에서 읽는다.
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const planCode = parsePlanCode(body?.planCode);
  if (!planCode) return NextResponse.json({ error: "올바른 플랜이 아닙니다." }, { status: 400 });

  const userIdBigInt = BigInt(userId);
  const existing = await prisma.subscription.findUnique({ where: { userId: userIdBigInt } });

  // customerKey는 한 번 발급하면 그대로 재사용한다 — 빌링키가 이 키에 묶여 있어서
  // 바꾸면 기존 카드가 끊긴다. userId를 그대로 쓰지 않는 이유는 유추 가능한 값을
  // customerKey로 쓰는 걸 토스가 금지하기 때문이다(ANONYMOUS도 빌링키엔 못 쓴다).
  const subscription = existing
    ? await prisma.subscription.update({ where: { id: existing.id }, data: { planCode } })
    : await prisma.subscription.create({
        data: { userId: userIdBigInt, planCode, customerKey: randomUUID(), status: "incomplete" },
      });

  return NextResponse.json({ customerKey: subscription.customerKey });
}
