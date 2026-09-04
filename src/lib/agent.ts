import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createAgent } from "langchain";
import { z } from "zod";
import { airQualityTool } from "./tools/airQuality";
import { weatherTool } from "./tools/weather";
import { culturePortalTool } from "./tools/culturePortal";
import { facilityInfoTool } from "./tools/facilityInfo";
import { parkingTool } from "./tools/parking";

const SYSTEM_PROMPT =
  "너는 나들이 장소를 추천하는 에이전트다. 지역(시/도)이 대화에서 한 번도 언급되지 않았으면 " +
  "임의로 지역을 추측하거나 도구를 호출하지 말고, 먼저 어느 지역으로 나들이 가는지 되물어라. " +
  "지역이 이미 언급됐으면(이번 메시지든 이전 대화든) 매번 다시 묻지 말고 그 지역 기준으로 진행해라.\n\n" +
  "사용자가 대기질이나 날씨를 직접 언급하지 않아도 " +
  "'날씨가 별로다', '컨디션이 안 좋다' 같은 애매한 표현이 나오면 먼저 get_air_quality와 get_weather 도구로 확인하고, " +
  "미세먼지가 나쁘거나 비/눈 예보가 있으면 실내 활동으로, 둘 다 좋으면 야외 활동으로 판단해서 이유와 함께 추천해라.\n\n" +
  "동반자 유형에 따라 추천 방향을 다르게 해라: 아이/영유아 동반이면 유모차·수유실 등 편의시설이 갖춰진 곳을, " +
  "연인이면 조용하고 분위기 있는 곳을 우선한다.\n\n" +
  "실내 활동을 추천할 때는 search_culture_events로 관련 행사를 찾고, " +
  "특히 아이 동반 요청이면 search_family_facility_info로 편의시설 정보를 확인해서 " +
  "적합하지 않은 곳(예: 계단이 많거나 관람 연령 제한이 있는 곳)은 제외하고 이유와 함께 추천해라.\n\n" +
  "예산이나 시간에 제약이 있으면(예: '돈 안 쓰고', '반나절', '짧게') search_family_facility_info로 " +
  "입장료(무료/유료)와 예상 관람 소요시간을 확인해서, 조건에 맞는 곳 위주로 추천하고 " +
  "제약을 어떻게 반영했는지 이유에 포함해라. 시간이 짧으면 추천 장소 개수도 1~2곳으로 줄여라.\n\n" +
  "속도가 중요하다: 서로 의존하지 않는 도구(예: get_air_quality와 get_weather, " +
  "또는 search_culture_events와 search_family_facility_info)는 한 턴에 동시에 같이 호출해라. " +
  "한 번에 하나씩 순차로 호출하지 마라.\n\n" +
  "주차 정보는 이 단계에서 미리 찾지 마라 — 사용자가 특정 장소의 주차를 따로 물어볼 때만 " +
  "search_daegu_parking을 써라(대구 외 지역이면 지원하지 않는다고 말해라).\n\n" +
  "최종 응답은 반드시 정해진 구조(JSON)로 출력해야 한다. 지역을 되물어야 하는 경우가 아니면 " +
  "장소를 3~5개 추천하고, 각 장소마다 알고 있는 정보만 채워라 — 모르는 필드(운영시간, 요금, 이미지 등)는 " +
  "지어내지 말고 비워둬라. daeguDistrict는 그 장소가 대구광역시 소속일 때만, 정확한 구/군을 알 때만 채워라.";

// ponytail: 무료 티어 쿼터는 모델별로 따로 있어서(실측 확인), 쿼터 소진 시
// 다음 모델로 순서대로 재시도. 유료 결제 전환 시 이 체인은 필요 없어짐.
// gemini-3.7-flash는 실측 결과 응답 없이 멈추는 경우가 있어 제외 (25초 타임아웃만 낭비).
const MODEL_FALLBACK_CHAIN = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
];

function isRetryableModelError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  // Recursion limit: 2026-09-04 실측 — 모델이 종료 조건 없이 도구 호출을 반복하다 25턴
  // 제한에 걸리는 경우가 있었음. 모델 자체의 불안정한 동작이라 다음 모델로 넘기는 게 맞다.
  return /429|RateLimitQuotaExhaustedError|Too Many Requests|404.*no longer available|모델 응답 시간 초과|Recursion limit/i.test(
    message
  );
}

// 모델이 아예 응답 없이 멈추는 경우(실측 확인: gemini-3.7-flash)가 있어, 다음 모델로
// 넘어갈 수 있도록 시도별 타임아웃을 둔다. 취소는 안 되지만(백그라운드에서 계속 돌 수
// 있음) 사용자 응답 흐름은 막지 않는다.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("모델 응답 시간 초과")), ms)
    ),
  ]);
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

const DAEGU_DISTRICTS = [
  "중구", "동구", "서구", "남구", "북구", "수성구", "달서구", "달성군", "군위군",
] as const;

const PlaceSchema = z.object({
  name: z.string().describe("장소 이름"),
  oneLineDescription: z.string().describe("결과 리스트 카드에 보여줄 한 줄 설명"),
  reason: z.string().describe("이 장소를 추천한 이유 (상세 화면용, 여러 문장 가능)"),
  address: z.string().optional().describe("주소 또는 위치 (모르면 비움)"),
  operatingHours: z.string().optional().describe("운영시간 (모르면 비움)"),
  fee: z.string().optional().describe("이용요금 (모르면 비움)"),
  features: z.array(z.string()).optional().describe("주요 정보/특징 목록 (예: 유모차 대여, 수유실)"),
  imageUrl: z.string().optional().describe("대표 이미지 URL (문화포털 도구가 준 경우만)"),
  daeguDistrict: z.enum(DAEGU_DISTRICTS).optional().describe("대구광역시 소속일 때만 구/군 (주차 정보 조회 가능 여부 판단용)"),
});

export const RecommendationSchema = z.object({
  needsMoreInfo: z.boolean().describe("지역 등 정보가 부족해 되물어야 하면 true, 추천 가능하면 false"),
  message: z.string().describe("needsMoreInfo가 true면 되묻는 질문, false면 추천 요약(판단 이유 포함)"),
  places: z.array(PlaceSchema).optional().describe("needsMoreInfo가 false일 때 추천 장소 3~5개"),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;

// history는 지금까지의 대화(사용자가 방금 보낸 메시지 포함) 전체를 받는다.
// 단일 메시지만 넘기면 "거기", "다른 곳도" 같은 후속 질문의 맥락을 에이전트가 전혀
// 모르게 된다 (5순위 대화 맥락 기억 요구사항과 직결).
export async function runAgent(history: ChatTurn[]): Promise<Recommendation> {
  let lastError: unknown;

  for (const model of MODEL_FALLBACK_CHAIN) {
    const llm = new ChatGoogleGenerativeAI({
      model,
      apiKey: process.env.GEMINI_API_KEY,
      temperature: 0,
    });

    const agent = createAgent({
      model: llm,
      tools: [airQualityTool, weatherTool, culturePortalTool, facilityInfoTool, parkingTool],
      systemPrompt: SYSTEM_PROMPT,
      responseFormat: RecommendationSchema,
    });

    try {
      const result = await withTimeout(agent.invoke({ messages: history }), 25000);
      return result.structuredResponse as Recommendation;
    } catch (err) {
      lastError = err;
      if (!isRetryableModelError(err)) throw err;
      console.warn(`[agent] ${model} 사용 불가, 다음 모델로 재시도`);
    }
  }

  throw lastError;
}

export type AgentProgressEvent = { type: "tool_start" | "tool_end"; tool: string };

// runAgent와 로직은 같지만(모델 폴백 체인, 타임아웃), agent.invoke() 대신
// agent.streamEvents(v3)로 도구 호출 시작/종료를 onProgress로 실시간 통지한다.
// 응답 자체가 느린 게 아니라 "화면에 아무 진행 상황도 안 보여서" 체감 속도가 느렸던
// 문제(2026-09-04 사용자 피드백)를 풀기 위한 추가 함수 — 기존 runAgent는 그대로 둔다.
export async function runAgentStream(
  history: ChatTurn[],
  onProgress?: (event: AgentProgressEvent) => void
): Promise<Recommendation> {
  let lastError: unknown;

  for (const model of MODEL_FALLBACK_CHAIN) {
    const llm = new ChatGoogleGenerativeAI({
      model,
      apiKey: process.env.GEMINI_API_KEY,
      temperature: 0,
    });

    const agent = createAgent({
      model: llm,
      tools: [airQualityTool, weatherTool, culturePortalTool, facilityInfoTool, parkingTool],
      systemPrompt: SYSTEM_PROMPT,
      responseFormat: RecommendationSchema,
    });

    try {
      const run = await agent.streamEvents({ messages: history }, { version: "v3" });

      if (onProgress) {
        // 도구 호출 스트림은 최종 응답(run.output)과 별개로 흘러오므로 fire-and-forget으로
        // 소비한다 — 여기서 나는 에러는 아래 run.output 대기 쪽에서 어차피 걸러진다.
        (async () => {
          try {
            for await (const call of run.toolCalls) {
              onProgress({ type: "tool_start", tool: call.name });
              call.status.then(
                () => onProgress({ type: "tool_end", tool: call.name }),
                () => onProgress({ type: "tool_end", tool: call.name })
              );
            }
          } catch {
            // ignore — 최종 결과 처리는 아래에서 계속됨
          }
        })();
      }

      const finalState = await withTimeout(run.output, 25000);
      return finalState.structuredResponse as Recommendation;
    } catch (err) {
      lastError = err;
      if (!isRetryableModelError(err)) throw err;
      console.warn(`[agent] ${model} 사용 불가, 다음 모델로 재시도`);
    }
  }

  throw lastError;
}

const SUGGEST_SYSTEM_PROMPT =
  "다음은 사용자와 나들이 추천 AI 에이전트의 대화 내역이다. 이 맥락을 이어서 사용자가 다음에 입력할 법한 " +
  "짧고 자연스러운 후속 메시지를 하나만 제안해라. 방금 추천받은 내용에 대한 후속 질문(예: 거기 주차는 어디에 " +
  "하는지, 다른 곳도 있는지, 더 저렴한 곳은 없는지)이 자연스럽다. 설명이나 따옴표 없이 문장 하나만 출력해라.";

// 대화 맥락 기반 다음 입력 제안. UX 보조 기능이라 실패해도 조용히 빈 문자열을 반환한다
// (에이전트 응답 자체를 막을 만큼 중요하지 않음).
export async function suggestNextMessage(history: ChatTurn[]): Promise<string> {
  const recent = history.slice(-6);
  if (recent.length === 0) return "";

  const transcript = recent
    .map((m) => `${m.role === "user" ? "사용자" : "에이전트"}: ${m.content}`)
    .join("\n");

  for (const model of MODEL_FALLBACK_CHAIN) {
    const llm = new ChatGoogleGenerativeAI({
      model,
      apiKey: process.env.GEMINI_API_KEY,
      temperature: 0.7,
    });

    try {
      const result = await withTimeout(
        llm.invoke([
          { role: "system", content: SUGGEST_SYSTEM_PROMPT },
          { role: "user", content: transcript },
        ]),
        10000
      );
      return (result.content as string).trim();
    } catch (err) {
      if (!isRetryableModelError(err)) return "";
    }
  }
  return "";
}
