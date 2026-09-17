import type { LifeInfoSource } from "@/lib/life-info";

type NaverWebItem = { title?: string; link?: string; description?: string };

const TAGS = /<[^>]*>/g;
const ENTITIES: Record<string, string> = { "&quot;": '"', "&amp;": "&", "&lt;": "<", "&gt;": ">", "&#39;": "'" };

function clean(value = "") {
  return value.replace(TAGS, "").replace(/&(?:quot|amp|lt|gt|#39);/g, (v) => ENTITIES[v] ?? v).replace(/\s+/g, " ").trim();
}

function authority(url: string): LifeInfoSource["authority"] {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (/\.go\.kr$|\.ac\.kr$/.test(host)) return "official";
    if (/news|press|journal|daily|times|herald|yna\.co\.kr/.test(host)) return "media";
  } catch { /* 잘못된 URL은 아래 community 등급으로 처리 */ }
  return "community";
}

function publishedAt(text: string): string | null {
  const match = text.match(/(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function searchNaverLifeInfo(query: string): Promise<LifeInfoSource[]> {
  const id = process.env.NAVER_SEARCH_CLIENT_ID?.trim();
  const secret = process.env.NAVER_SEARCH_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new Error("NAVER_SEARCH_API_NOT_CONFIGURED");

  // 네이버 검색 API는 developers.naver.com 방식(openapi.naver.com,
  // X-Naver-Client-Id/Secret)에서 NAVER API HUB(NCP)로 이관됐다 — 엔드포인트와
  // 인증 헤더가 둘 다 바뀌었다(naverDirections.ts의 x-ncp-apigw-api-key 패턴과 동일).
  const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/webkr");
  url.searchParams.set("query", query);
  url.searchParams.set("display", "5");
  const response = await fetch(url, {
    headers: { "x-ncp-apigw-api-key-id": id, "x-ncp-apigw-api-key": secret },
    signal: AbortSignal.timeout(6_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`NAVER_SEARCH_FAILED_${response.status}`);
  const body = await response.json() as { items?: NaverWebItem[] };
  const seen = new Set<string>();
  return (body.items ?? []).flatMap((item) => {
    const link = item.link?.trim() ?? "";
    if (!/^https?:\/\//i.test(link) || seen.has(link)) return [];
    seen.add(link);
    const title = clean(item.title);
    const description = clean(item.description).slice(0, 350);
    return [{ title, url: link, description, publishedAt: publishedAt(`${title} ${description}`), authority: authority(link) }];
  });
}
