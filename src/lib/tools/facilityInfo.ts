import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import facilityIndex from "@/lib/rag/index.json";

type IndexedDoc = { id: string; text: string; embedding: number[] };
const docs = facilityIndex as IndexedDoc[];

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const TOP_K = 3;

export const facilityInfoTool = tool(
  async ({ query }) => {
    if (docs.length === 0 || docs[0].embedding.length === 0) {
      return "실내/가족동반 시설 안내 문서 인덱스가 아직 준비되지 않았습니다.";
    }

    const embeddings = new GoogleGenerativeAIEmbeddings({
      model: "gemini-embedding-001",
      apiKey: process.env.GEMINI_API_KEY,
    });
    const queryVector = await embeddings.embedQuery(query);

    const ranked = docs
      .map((doc) => ({ doc, score: cosineSimilarity(queryVector, doc.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);

    return ranked.map((r) => `- ${r.doc.text}`).join("\n");
  },
  {
    name: "search_family_facility_info",
    description:
      "영유아/아이 동반 시설의 편의시설 안내(수유실, 유모차 대여, 관람 연령 제한 등)를 의미 기반으로 검색한다. " +
      "이 문서는 아이 동반 케이스 전용이다 — 연인, 친구 등 다른 동반자 유형 판단에는 사용하지 마라.",
    schema: z.object({
      query: z.string().describe("검색할 조건이나 상황 (예: '아이랑 갈만한 유모차 이용 가능한 곳')"),
    }),
  }
);
