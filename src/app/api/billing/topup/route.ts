import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { topUpWallet } from "@/lib/billing/wallet";

// 카드가 이미 등록된 사용자의 "지금 충전하기" — 빌링키가 있으니 결제창 없이 바로
// 서버에서 승인한다. 카드 미등록 사용자는 /api/billing/checkout + 토스 위젯으로
// 먼저 등록해야 한다(이 라우트는 등록을 대신하지 않는다).
export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const wallet = await prisma.wallet.findUnique({ where: { userId: BigInt(userId) } });
  if (!wallet?.billingKey) return NextResponse.json({ error: "등록된 카드가 없어요. 먼저 카드를 등록해주세요." }, { status: 400 });

  const ok = await topUpWallet(wallet, session.user.email);
  if (!ok) return NextResponse.json({ error: "충전에 실패했어요. 카드 정보를 확인해주세요." }, { status: 402 });
  return NextResponse.json({ ok: true });
}
