import { verify } from "node:crypto";
import type { Owner } from "./quota";

// AdMob 리워드 광고 서버 측 검증(SSV). 구글 서버가 광고 시청 완료 시 이 파라미터들을
// GET 쿼리스트링으로 우리 콜백에 실어 보낸다. 서명 대상은 "signature" 파라미터 앞까지의
// 쿼리스트링 원문이다(공식 스펙) — key_id는 signature 뒤에 오므로 자연히 제외된다.
export function ssvSignedContent(rawQuery: string): string {
  const idx = rawQuery.indexOf("&signature=");
  return idx === -1 ? rawQuery : rawQuery.slice(0, idx);
}

export function verifySsvSignature(rawQuery: string, signatureB64Url: string, publicKeyPem: string): boolean {
  try {
    const content = ssvSignedContent(rawQuery);
    const signature = Buffer.from(signatureB64Url, "base64url");
    return verify("sha256", Buffer.from(content), publicKeyPem, signature);
  } catch {
    return false;
  }
}

// Flutter 앱이 리워드 광고 로드 시 serverSideVerificationOptions.customData로 실어
// 보내야 하는 형식. 소유자 표현은 quota.ts의 Owner와 동일하게 맞춘다.
export function parseSsvOwner(customData: string | null): Owner | null {
  if (!customData) return null;
  if (customData.startsWith("user:")) {
    const userId = customData.slice(5);
    return /^\d+$/.test(userId) ? { userId } : null;
  }
  if (customData.startsWith("guest:")) {
    const hash = customData.slice(6);
    return /^[a-f0-9]{64}$/.test(hash) ? { sessionKeyHash: hash } : null;
  }
  return null;
}

const VERIFIER_KEYS_URL = "https://www.gstatic.com/admob/reward/verifier-keys.json";

// 구글이 도는 공개키 목록 — Next.js의 fetch 캐시로 재조회 빈도를 낮춘다(직접 캐시 안 짜도 됨).
export async function fetchSsvPublicKey(keyId: string): Promise<string | null> {
  const res = await fetch(VERIFIER_KEYS_URL, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`AdMob 공개키 조회 실패: ${res.status}`);
  const data = (await res.json()) as { keys: { keyId: number; pem: string }[] };
  return data.keys.find((k) => String(k.keyId) === keyId)?.pem ?? null;
}
