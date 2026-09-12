import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { embedQueryCached } from "@/lib/embeddings";
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
  async ({ query, region, dtype, keyword }) => {
    // ponytail: get_air_quality/get_weather와 같은 원인의 같은 방어 — airQuality.ts의 동일
    // 패턴 주석 참고. 여긴 임베딩 검색이라 아무 문자열이 들어와도 에러 없이 동작한다.
    // search_culture_events(dtype+keyword)와 헷갈리는 경우가 실측으로 가장 잦아서
    // (2026-09-10 LangSmith 트레이스) 그 둘도 합쳐서 검색어로 쓴다.
    const derivedQuery = [keyword, dtype].filter(Boolean).join(" ") || undefined;
    const effectiveQuery = query ?? region ?? derivedQuery;
    if (!effectiveQuery) return "검색 조건이 없어 편의시설 정보를 조회할 수 없습니다.";

    if (docs.length === 0 || docs[0].embedding.length === 0) {
      return "실내/가족동반 시설 안내 문서 인덱스가 아직 준비되지 않았습니다.";
    }

    const queryVector = await embedQueryCached(effectiveQuery);
    if (!queryVector) return "편의시설 정보를 조회하지 못했습니다. 다른 도구 결과로 판단해라.";

    const ranked = docs
      .map((doc) => ({ doc, score: cosineSimilarity(queryVector, doc.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);

    // 2026-09-13 LangSmith 트레이스: 모델이 원하는 장소가 안 나오자 질의만 바꿔가며
    // 이 도구를 11번 부르다 recursion limit 25에 걸려 요청 하나가 통째로 실패했다.
    // 코퍼스가 9건짜리 요약본이라 질의를 바꿔도 결과가 거의 같은데(실측: 관련·무관 질의
    // 유사도가 0.58~0.77로 겹쳐 임계값으로도 못 거른다) 모델은 그걸 알 방법이 없다 —
    // 그래서 결과에 직접 적어준다.
    return (
      ranked.map((r) => `- ${r.doc.text}`).join("\n") +
      "\n(이 자료는 전국 주요 시설 9건짜리 요약본이다. 질의를 바꿔도 결과가 거의 같으니 " +
      "다시 호출하지 말고, 찾는 장소가 없으면 없는 것으로 보고 네가 아는 정보로 판단해라.)"
    );
  },
  {
    name: "search_family_facility_info",
    description:
      "실내 문화시설의 편의시설(수유실, 유모차 대여, 관람 연령 제한), 입장료/무료 여부, 예상 관람 소요시간을 " +
      "의미 기반으로 검색한다. 아이 동반 여부 판단뿐 아니라, 예산(무료/저렴한 곳 원함)이나 시간(반나절, 짧게 등) " +
      "제약이 있을 때도 사용한다. 연인/친구 동반자 유형 자체를 판단하는 용도로는 사용하지 마라 — 이 문서는 " +
      "가족 편의시설 중심 정보다.",
    schema: z.object({
      query: z.string().optional().describe("검색할 조건이나 상황 (예: '아이랑 갈만한 유모차 이용 가능한 곳')"),
      region: z.string().optional().describe("(다른 도구와 헷갈렸을 때 대비 — query와 동일하게 처리)"),
      dtype: z.string().optional().describe("(다른 도구와 헷갈렸을 때 대비 — keyword와 합쳐 검색어로 처리)"),
      keyword: z.string().optional().describe("(다른 도구와 헷갈렸을 때 대비 — dtype과 합쳐 검색어로 처리)"),
    }),
  }
);
