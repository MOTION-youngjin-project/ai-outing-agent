"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchPlace, placeResultToMeta } from "@/lib/clientApi";
import { DetailScreen } from "@/components/screens/DetailScreen";

// 추천 결과가 아니라 홈 화면의 "장소 검색"(카카오)에서 들어오는 경로 — runId가 없다.
export default function SearchedPlaceDetailPage() {
  const { placeId } = useParams<{ placeId: string }>();
  const query = useQuery({ queryKey: ["place", placeId], queryFn: () => fetchPlace(placeId) });

  if (query.isLoading) {
    return <p className="px-5 py-10 text-center text-[14px] text-muted">불러오는 중...</p>;
  }
  if (query.isError || !query.data) {
    return <p className="px-5 py-10 text-center text-[14px] text-muted">장소를 찾을 수 없습니다.</p>;
  }
  return <DetailScreen place={placeResultToMeta(query.data)} runId={null} />;
}
