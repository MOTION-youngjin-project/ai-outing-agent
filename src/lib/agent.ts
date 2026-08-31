import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createAgent } from "langchain";
import { airQualityTool } from "./tools/airQuality";

const SYSTEM_PROMPT =
  "너는 나들이 장소를 추천하는 에이전트다. 사용자가 대기질을 직접 언급하지 않아도 " +
  "'날씨가 별로다', '컨디션이 안 좋다' 같은 애매한 표현이 나오면 먼저 get_air_quality 도구로 확인하고, " +
  "미세먼지가 나쁘면 실내 활동으로, 좋으면 야외 활동으로 판단해서 이유와 함께 추천해라.";

export async function runAgent(input: string) {
  const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0,
  });

  const agent = createAgent({
    model: llm,
    tools: [airQualityTool],
    systemPrompt: SYSTEM_PROMPT,
  });

  const result = await agent.invoke({
    messages: [{ role: "user", content: input }],
  });

  const last = result.messages[result.messages.length - 1];
  return last.content as string;
}
