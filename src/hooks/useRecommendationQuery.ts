"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchRecommendation } from "@/lib/clientApi";

// /recommend/[runId] 아래 4개 라우트(결과/상세/주차/주차상세)가 전부 공유하는 조회 —
// 같은 queryKey라 React Query 캐시가 자동으로 공유된다(useRecommendationFlow가 추천 성공
// 직후 setQueryData로 미리 채워두면 결과 화면은 재요청 없이 바로 뜨고, 새로고침/직링크는
// 이 훅이 GET /api/recommend/[runId]로 다시 채운다).
export function useRecommendationQuery(runId: string) {
  return useQuery({
    queryKey: ["recommend", runId],
    queryFn: () => fetchRecommendation(runId),
    // runId 하나의 결과는 절대 안 바뀐다(불변) — staleTime 기본값(0)이면 추천 성공 직후
    // setQueryData로 채워둔 완전한 결과를 결과 화면이 마운트되자마자 다시 GET으로 덮어써서,
    // 카카오 매칭 실패한 장소(DB route_places엔 없음)가 방금 받은 응답에 있었는데도
    // 화면에서 사라지는 문제가 있었다(2026-09-08 실측).
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
