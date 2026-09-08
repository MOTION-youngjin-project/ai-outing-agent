"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useRecommendationQuery } from "@/hooks/useRecommendationQuery";
import { fetchParkingSpotById } from "@/lib/clientApi";
import { ParkingDetailScreen } from "@/components/screens/ParkingDetailScreen";

export default function ParkingSpotDetailPage() {
  const { runId, placeId, pkltId } = useParams<{ runId: string; placeId: string; pkltId: string }>();
  const recommendationQuery = useRecommendationQuery(runId);
  const place = recommendationQuery.data?.places?.find((p) => p.placeId === placeId);
  const district = place?.daeguDistrict;

  const spotQuery = useQuery({
    queryKey: ["parking-spot", pkltId, district, place?.name],
    queryFn: () => fetchParkingSpotById(pkltId, district!, place?.name),
    enabled: !!district,
  });

  if (recommendationQuery.isLoading || (!!district && spotQuery.isLoading)) {
    return <p className="px-5 py-10 text-center text-[14px] text-muted">불러오는 중...</p>;
  }
  if (recommendationQuery.isError || !place || !district || !spotQuery.data) {
    return <p className="px-5 py-10 text-center text-[14px] text-muted">주차장을 찾을 수 없습니다.</p>;
  }
  return <ParkingDetailScreen spot={spotQuery.data} runId={runId} placeId={placeId} />;
}
