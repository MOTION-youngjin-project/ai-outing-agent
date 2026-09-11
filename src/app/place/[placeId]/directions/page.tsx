"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchPlace, placeResultToMeta } from "@/lib/clientApi";
import { DirectionsScreen } from "@/components/screens/DirectionsScreen";

export default function SearchedPlaceDirectionsPage() {
  const { placeId } = useParams<{ placeId: string }>();
  const query = useQuery({ queryKey: ["place", placeId], queryFn: () => fetchPlace(placeId) });

  if (query.isLoading) {
    return <p className="px-5 py-10 text-center text-[14px] text-muted">불러오는 중...</p>;
  }
  if (query.isError || !query.data) {
    return <p className="px-5 py-10 text-center text-[14px] text-muted">장소를 찾을 수 없습니다.</p>;
  }
  return <DirectionsScreen place={placeResultToMeta(query.data)} runId={null} placeId={placeId} />;
}
