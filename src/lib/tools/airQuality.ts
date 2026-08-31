import { tool } from "@langchain/core/tools";
import { z } from "zod";

// TODO: 에어코리아 실시간 측정정보 API로 교체
// https://www.data.go.kr/data/15073861/openapi.do (AIRKOREA_API_KEY 필요)
async function fetchAirQuality(region: string) {
  const mockByRegion: Record<string, { pm10: number; grade: string }> = {
    대구: { pm10: 120, grade: "나쁨" },
    서울: { pm10: 45, grade: "보통" },
  };
  return mockByRegion[region] ?? { pm10: 30, grade: "좋음" };
}

export const airQualityTool = tool(
  async ({ region }) => {
    const { pm10, grade } = await fetchAirQuality(region);
    return `${region} 지역 미세먼지(PM10) 농도는 ${pm10}㎍/m³, 등급은 "${grade}"입니다.`;
  },
  {
    name: "get_air_quality",
    description:
      "특정 지역의 실시간 미세먼지(대기질) 정보를 조회한다. 날씨나 컨디션이 애매하게 언급될 때도 먼저 확인해서 실내/야외 활동 판단에 활용한다.",
    schema: z.object({
      region: z.string().describe("대기질을 조회할 지역명 (예: 대구, 서울)"),
    }),
  }
);
