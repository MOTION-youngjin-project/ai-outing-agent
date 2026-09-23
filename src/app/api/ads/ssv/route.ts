import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { grantAdCredit } from "@/lib/ads/quota";
import { fetchSsvPublicKey, parseSsvOwner, verifySsvSignature } from "@/lib/ads/ssv";

export const runtime = "nodejs";

// AdMob 리워드 광고 서버 측 검증(SSV) 콜백. 구글 서버가 직접 호출한다 — 클라이언트(앱)를
// 거치지 않으므로 조작된 클라이언트가 광고를 안 보고 질문권을 요청하는 걸 막는다.
// 앱은 리워드 광고 로드 시 serverSideVerificationOptions.customData에 "user:<id>" 또는
// "guest:<sessionKeyHash>"를 실어야 하고, AdMob 콘솔의 이 광고 단위 SSV 콜백 URL을
// https://<도메인>/api/ads/ssv 로 설정해야 한다.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const params = url.searchParams;
  const keyId = params.get("key_id");
  const signature = params.get("signature");
  const transactionId = params.get("transaction_id");
  const customData = params.get("custom_data");

  if (!keyId || !signature || !transactionId) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  const owner = parseSsvOwner(customData);
  if (!owner) return NextResponse.json({ error: "unknown owner" }, { status: 400 });

  const pem = await fetchSsvPublicKey(keyId).catch(() => null);
  if (!pem) return NextResponse.json({ error: "unknown key" }, { status: 400 });

  const rawQuery = url.search.slice(1);
  if (!verifySsvSignature(rawQuery, signature, pem)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    await prisma.adSsvTransaction.create({ data: { transactionId } });
  } catch {
    // 이미 처리한 transaction_id — 재시도/리플레이. 크레딧은 또 주지 않고 성공으로 끝낸다.
    return NextResponse.json({ ok: true });
  }

  await grantAdCredit(owner);
  return NextResponse.json({ ok: true });
}
