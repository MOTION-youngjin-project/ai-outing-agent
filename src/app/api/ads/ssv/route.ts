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
    console.error("SSV 콜백 필수 파라미터 누락:", Object.fromEntries(params));
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  const pem = await fetchSsvPublicKey(keyId).catch((err) => {
    console.error("SSV 공개키 조회 실패:", err);
    return null;
  });
  if (!pem) {
    console.error("SSV 알 수 없는 key_id:", keyId);
    return NextResponse.json({ error: "unknown key" }, { status: 400 });
  }

  const rawQuery = url.search.slice(1);
  if (!verifySsvSignature(rawQuery, signature, pem)) {
    console.error("SSV 서명 검증 실패:", rawQuery);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  // 서명은 유효함(구글이 실제로 보낸 콜백) — custom_data가 없거나 형식이 안 맞으면
  // 누구에게 줄지 몰라 크레딧만 못 준다. 콜백 자체는 정상 처리된 것이므로 200을
  // 돌려준다(AdMob 콘솔의 "URL 확인" 테스트도 custom_data 없이 호출한다).
  const owner = parseSsvOwner(customData);
  if (!owner) {
    console.warn("SSV 콜백에 유효한 custom_data 없음 — 크레딧 미지급:", { transactionId, customData });
    return NextResponse.json({ ok: true });
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
