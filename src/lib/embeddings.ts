import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

// 도구(facilityInfo, pdfGuide)가 매 호출마다 질의를 임베딩한다. 두 가지를 공통으로 처리한다:
//  1) 재시도 1회 — 기본값 6회는 429를 만나면 retry-after만큼 기다렸다 다시 시도해서
//     도구 하나가 25초를 먹는다(2026-09-12 실측: search_family_facility_info 24.9초).
//     임베딩이 실패하면 호출부가 키워드 검색으로 낮춰서 동작하므로 오래 기다릴 이유가 없다.
//  2) 같은 질의 캐시 — 대화 한 번에 같은 문구로 여러 도구가 임베딩을 부르는 일이 잦다.
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; vector: number[] }>();

let client: GoogleGenerativeAIEmbeddings | null = null;
function getClient() {
  if (!client) {
    client = new GoogleGenerativeAIEmbeddings({
      model: "gemini-embedding-001",
      apiKey: process.env.GEMINI_API_KEY,
      maxRetries: 1,
    });
  }
  return client;
}

// 실패하면 null. 호출부는 임베딩 없이도 동작하는 경로(키워드 검색 등)로 넘어간다.
export async function embedQueryCached(text: string): Promise<number[] | null> {
  if (!process.env.GEMINI_API_KEY) return null;

  const hit = cache.get(text);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.vector;

  const vector = await getClient().embedQuery(text).catch(() => null);
  if (vector) cache.set(text, { at: Date.now(), vector });
  return vector;
}
