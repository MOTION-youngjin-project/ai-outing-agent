"use client";

import { useParams } from "next/navigation";
import { useRecommendationQuery } from "@/hooks/useRecommendationQuery";
import { TransitScreen } from "@/components/screens/TransitScreen";

export default function TransitDirectionsPage() {
  const { runId, placeId } = useParams<{ runId: string; placeId: string }>();
  const query = useRecommendationQuery(runId);

  if (query.isLoading) {
    return <p className="px-5 py-10 text-center text-[14px] text-muted">불러오는 중...</p>;
  }
  const place = query.data?.places?.find((p) => p.placeId === placeId);
  if (query.isError || !place) {
    return <p className="px-5 py-10 text-center text-[14px] text-muted">장소를 찾을 수 없습니다.</p>;
  }
  return <TransitScreen place={place} runId={runId} placeId={placeId} />;
}
