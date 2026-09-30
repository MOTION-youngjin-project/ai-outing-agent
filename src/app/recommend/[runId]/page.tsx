"use client";

import { useParams } from "next/navigation";
import { useRecommendationQuery } from "@/hooks/useRecommendationQuery";
import { ResultsScreen } from "@/components/screens/ResultsScreen";

export default function RecommendResultsPage() {
  const { runId } = useParams<{ runId: string }>();
  const query = useRecommendationQuery(runId);

  if (query.isLoading) {
    return <p className="px-5 py-10 text-center text-[14px] text-muted">불러오는 중...</p>;
  }
  if (query.isError || !query.data) {
    return <p className="px-5 py-10 text-center text-[14px] text-muted">추천 결과를 찾을 수 없습니다.</p>;
  }
  return <ResultsScreen recommendation={query.data} runId={runId} />;
}
