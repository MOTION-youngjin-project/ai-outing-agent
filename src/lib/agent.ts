import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createAgent } from "langchain";
import { airQualityTool } from "./tools/airQuality";
import { weatherTool } from "./tools/weather";
import { culturePortalTool } from "./tools/culturePortal";
import { facilityInfoTool } from "./tools/facilityInfo";

const SYSTEM_PROMPT =
  "너는 나들이 장소를 추천하는 에이전트다. 사용자가 대기질이나 날씨를 직접 언급하지 않아도 " +
  "'날씨가 별로다', '컨디션이 안 좋다' 같은 애매한 표현이 나오면 먼저 get_air_quality와 get_weather 도구로 확인하고, " +
  "미세먼지가 나쁘거나 비/눈 예보가 있으면 실내 활동으로, 둘 다 좋으면 야외 활동으로 판단해서 이유와 함께 추천해라.\n\n" +
  "동반자 유형에 따라 추천 방향을 다르게 해라: 아이/영유아 동반이면 유모차·수유실 등 편의시설이 갖춰진 곳을, " +
  "연인이면 조용하고 분위기 있는 곳을 우선한다.\n\n" +
  "실내 활동을 추천할 때는 search_culture_events로 관련 행사를 찾고, " +
  "특히 아이 동반 요청이면 search_family_facility_info로 편의시설 정보를 확인해서 " +
  "적합하지 않은 곳(예: 계단이 많거나 관람 연령 제한이 있는 곳)은 제외하고 이유와 함께 추천해라.\n\n" +
  "속도가 중요하다: 서로 의존하지 않는 도구(예: get_air_quality와 get_weather, " +
  "또는 search_culture_events와 search_family_facility_info)는 한 턴에 동시에 같이 호출해라. " +
  "한 번에 하나씩 순차로 호출하지 마라.";

export async function runAgent(input: string) {
  const llm = new ChatGoogleGenerativeAI({
    model: "gemini-3.6-flash",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0,
  });

  const agent = createAgent({
    model: llm,
    tools: [airQualityTool, weatherTool, culturePortalTool, facilityInfoTool],
    systemPrompt: SYSTEM_PROMPT,
  });

  const result = await agent.invoke({
    messages: [{ role: "user", content: input }],
  });

  const last = result.messages[result.messages.length - 1];
  return last.content as string;
}
