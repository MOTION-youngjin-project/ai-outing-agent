import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createAgent } from "langchain";
import { airQualityTool } from "./tools/airQuality";
import { weatherTool } from "./tools/weather";
import { culturePortalTool } from "./tools/culturePortal";

const SYSTEM_PROMPT =
  "너는 나들이 장소를 추천하는 에이전트다. 사용자가 대기질이나 날씨를 직접 언급하지 않아도 " +
  "'날씨가 별로다', '컨디션이 안 좋다' 같은 애매한 표현이 나오면 먼저 get_air_quality와 get_weather 도구로 확인하고, " +
  "미세먼지가 나쁘거나 비/눈 예보가 있으면 실내 활동으로, 둘 다 좋으면 야외 활동으로 판단해서 이유와 함께 추천해라. " +
  "실내 활동을 추천할 때, 특히 아이 동반이나 전시/공연 관람 같은 요청이면 search_culture_events 도구로 관련 행사도 함께 찾아봐라.";

export async function runAgent(input: string) {
  const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0,
  });

  const agent = createAgent({
    model: llm,
    tools: [airQualityTool, weatherTool, culturePortalTool],
    systemPrompt: SYSTEM_PROMPT,
  });

  const result = await agent.invoke({
    messages: [{ role: "user", content: input }],
  });

  const last = result.messages[result.messages.length - 1];
  return last.content as string;
}
