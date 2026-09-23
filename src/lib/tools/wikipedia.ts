// 위키백과 REST API로 유명 랜드마크의 대표 사진을 가져온다. 키·빌링 계정이 필요 없는
// 무료 API라 TourAPI 갤러리보다 먼저 시도한다(2026-09-23). TourAPI는 대구미술관 같은
// 곳에서 건물 사진 대신 전시 포스터가 뜨는 문제가 있고, 메타데이터로는 부적절한 사진을
// 걸러낼 방법이 없다는 게 이미 결론남(docs/research/place-image-quality-filtering.md).
// 위키백과 문서가 있는 "유명한" 곳에서만 동작하고, 없으면(404) 조용히 폴백한다.
import type { PlaceImageResult } from "./tourApi";

const SUMMARY_URL = "https://ko.wikipedia.org/api/rest_v1/page/summary/";

type WikiSummary = {
  type?: string;
  extract?: string;
  thumbnail?: { source: string };
  originalimage?: { source: string };
};

export async function fetchWikipediaImage(name: string): Promise<PlaceImageResult | null> {
  const res = await fetch(`${SUMMARY_URL}${encodeURIComponent(name)}`, {
    // 위키미디어 API 정책상 User-Agent 없이 부르면 차단될 수 있다.
    headers: { "User-Agent": "ai-outing-agent/1.0 (student project; MOTION-youngjin-project/ai-outing-agent)" },
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!res?.ok) return null;

  const data = (await res.json().catch(() => null)) as WikiSummary | null;
  if (!data) return null;
  // 동명이인 문서(다른 도시의 같은 이름 장소)를 걸러낸다 — 이 앱은 대구 전용이라
  // 본문에 "대구"가 없으면 엉뚱한 지역 문서일 가능성이 높다.
  if (data.type === "disambiguation" || !data.extract?.includes("대구")) return null;

  const originalUrl = data.originalimage?.source ?? data.thumbnail?.source;
  if (!originalUrl) return null;
  return { originalUrl, thumbnailUrl: data.thumbnail?.source ?? null };
}
