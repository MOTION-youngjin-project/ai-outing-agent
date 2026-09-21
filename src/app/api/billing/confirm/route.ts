import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { issueBillingKey, TossError } from "@/lib/billing/toss";
import { topUpWallet } from "@/lib/billing/wallet";

// 카드 등록 성공 시 토스가 리다이렉트로 보내는 자리(successUrl). authKey는 1회용이라
// 여기서 바로 빌링키로 바꾸고 첫 충전까지 끝낸다.
export async function GET(req: NextRequest) {
  const authKey = req.nextUrl.searchParams.get("authKey");
  const customerKey = req.nextUrl.searchParams.get("customerKey");
  const back = (params: string) => NextResponse.redirect(new URL(`/billing?${params}`, req.nextUrl.origin));

  if (!authKey || !customerKey) return back("error=invalid");

  // customerKey는 URL로 돌아온 값이라 신뢰 경계 밖이다 — 남의 customerKey를 넣어
  // 남의 지갑에 카드를 등록시키지 못하도록, 세션의 사용자와 같은 행인지 확인한다.
  const session = await auth();
  if (!session?.user?.id) return back("error=auth");
  const wallet = await prisma.wallet.findUnique({ where: { customerKey } });
  if (!wallet || wallet.userId !== BigInt(session.user.id)) return back("error=invalid");

  try {
    const billingKey = await issueBillingKey(authKey, customerKey);
    const withKey = await prisma.wallet.update({ where: { id: wallet.id }, data: { billingKey } });
    const ok = await topUpWallet(withKey, session.user.email);
    return back(ok ? "ok=1" : "error=charge");
  } catch (err) {
    console.error("빌링키 발급 실패:", err instanceof TossError ? `${err.code}: ${err.message}` : err);
    return back("error=billing");
  }
}
