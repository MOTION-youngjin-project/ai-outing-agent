"use client";

import { useRecommendationFlow } from "@/hooks/useRecommendationFlow";
import { InputScreen } from "@/components/screens/InputScreen";
import type { Region } from "@/lib/clientApi";

export function HomeClient({ initialRegions }: { initialRegions: Region[] }) {
  const flow = useRecommendationFlow(initialRegions);
  return <InputScreen flow={flow} />;
}
