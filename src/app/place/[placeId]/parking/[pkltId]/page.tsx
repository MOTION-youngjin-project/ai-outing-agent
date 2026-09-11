"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchPlace, fetchParkingSpotById } from "@/lib/clientApi";
import { ParkingDetailScreen } from "@/components/screens/ParkingDetailScreen";

export default function SearchedPlaceParkingSpotDetailPage() {
  const { placeId, pkltId } = useParams<{ placeId: string; pkltId: string }>();
  const placeQuery = useQuery({ queryKey: ["place", placeId], queryFn: () => fetchPlace(placeId) });
  const district = placeQuery.data?.daeguDistrict;

  const spotQuery = useQuery({
    queryKey: ["parking-spot", pkltId, district, placeQuery.data?.name],
    queryFn: () => fetchParkingSpotById(pkltId, district!, placeQuery.data?.name, placeQuery.data ?? undefined),
    enabled: !!district,
  });

  if (placeQuery.isLoading || (!!district && spotQuery.isLoading)) {
    return <p className="px-5 py-10 text-center text-[14px] text-muted">불러오는 중...</p>;
  }
  if (spotQuery.isError) return <p role="alert" className="p-5">주차 정보를 불러오지 못했습니다. <button onClick={() => spotQuery.refetch()}>다시 시도</button></p>;
  if (placeQuery.isError || !placeQuery.data || !district || !spotQuery.data) {
    return <p className="px-5 py-10 text-center text-[14px] text-muted">주차장을 찾을 수 없습니다.</p>;
  }
  return <ParkingDetailScreen spot={spotQuery.data} runId={null} placeId={placeId} />;
}
