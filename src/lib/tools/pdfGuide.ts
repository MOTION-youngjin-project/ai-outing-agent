import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import type { RecommendationSource } from "@/lib/recommendation-sources";

function cosine(a: number[], b: number[]) {
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return dot / (Math.sqrt(aa) * Math.sqrt(bb) || 1);
}

function lexicalScore(query: string, content: string) {
  const normalizedQuery = query.toLowerCase()
    .replace(/지하철/g, "지하철 도시철도")
    .replace(/맛집/g, "맛집 음식점")
    .replace(/데이트/g, "데이트 연인")
    .replace(/[^0-9a-z가-힣\s]/g, " ");
  const normalizedContent = content.toLowerCase();
  const words = normalizedQuery.split(/\s+/).filter((word) => word.length >= 2);
  const bigrams = [...normalizedQuery.replace(/\s+/g, "")].map((_, index, chars) => chars.slice(index, index + 2).join("")).filter((token) => token.length === 2);
  const tokens = [...new Set([...words, ...bigrams])];
  return tokens.reduce((score, token) => score + (normalizedContent.includes(token) ? token.length : 0), 0) / Math.max(tokens.length, 1);
}

export async function searchPdfGuides(query: string, limit = 5) {
  const { prisma } = await import("@/lib/prisma");
  const queryVector = process.env.GEMINI_API_KEY ? await new GoogleGenerativeAIEmbeddings({ model: "gemini-embedding-001", apiKey: process.env.GEMINI_API_KEY }).embedQuery(query).catch(() => null) : null;
  const chunks = await prisma.ragChunk.findMany({
    where: { document: { isActive: true, source: { code: "RAG_PDF" } } },
    include: { document: { select: { title: true, sourceUrl: true } } },
  });
  return chunks.map((chunk) => ({
    sourceId: `pdf-${chunk.id}`,
    content: chunk.content,
    score: queryVector && Array.isArray(chunk.embedding) && chunk.embedding.length === queryVector.length
      ? cosine(queryVector, chunk.embedding as number[]) + lexicalScore(query, `${chunk.document.title}\n${chunk.content}`) * 0.8
      : lexicalScore(query, chunk.content),
    retrievalMode: queryVector && Array.isArray(chunk.embedding) && chunk.embedding.length === queryVector.length ? "hybrid" : "keyword_fallback",
    title: chunk.document.title,
    sourceUrl: chunk.document.sourceUrl,
    page: (chunk.metadataJson as { page?: number } | null)?.page,
  })).filter(chunk => chunk.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.min(Math.max(limit, 1), 8));
}

export function createPdfGuideTool(sources: Map<string, RecommendationSource>) {
return tool(async ({ query }) => {
  try {
    const results = await searchPdfGuides(query);
    if (!results.length) return "색인된 대구 관광 PDF에서 관련 정보를 찾지 못했습니다.";
    for (const result of results) sources.set(result.sourceId, {
      id: result.sourceId, documentTitle: result.title,
      page: result.page ?? null, sourceUrl: result.sourceUrl,
    });
    return results.map((result) => `${result.content}\n[출처 ID: ${result.sourceId}, ${result.title}, PDF p.${result.page ?? "?"}]`).join("\n\n");
  } catch (error) {
    return `대구 관광 PDF 검색 실패: ${error instanceof Error ? error.message : String(error)}`;
  }
}, {
  name: "search_daegu_pdf_guides",
  description: "공식 대구 음식점·관광·도시철도 여행 PDF를 의미 기반으로 검색한다. 맛집, 대구10미, 대중교통 코스, 관광지 특징과 기존 추천 코스를 찾을 때 사용한다.",
  schema: z.object({ query: z.string().describe("PDF에서 찾을 여행 조건 또는 장소·음식 키워드") }),
});
}
