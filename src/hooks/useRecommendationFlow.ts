"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import type { ChatTurn, Recommendation } from "@/lib/agent";
import { useAppStore } from "@/lib/store";
import {
  fetchRegions,
  postRecommend,
  postSuggest,
  type RecommendProgressEvent,
} from "@/lib/clientApi";

const TOOL_LABELS: Record<string, string> = {
  get_air_quality: "대기질 확인 중",
  get_weather: "날씨 확인 중",
  search_culture_events: "문화행사 찾는 중",
  search_family_facility_info: "편의시설 정보 확인 중",
  search_daegu_parking: "주차장 확인 중",
};

const SUGGESTIONS = [
  "애기랑 나갈만한 곳 있어? 유모차도 가지고 갈 거야",
  "여자친구랑 데이트할만한 곳 있어?",
  "요즘 날씨가 별로네, 실내에서 놀만한 곳 있어?",
  "돈 안 쓰고 반나절만 나갔다 올 데 있어?",
];

function randomSuggestion() {
  return SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)];
}

// 대화 히스토리(다음 요청의 맥락)와 다음 질문 제안 생성에 쓰는 텍스트 요약.
function summarize(rec: Recommendation): string {
  if (rec.needsMoreInfo || !rec.places) return rec.message;
  const list = rec.places.map((p) => `- ${p.name}: ${p.oneLineDescription}`).join("\n");
  return `${rec.message}\n${list}`;
}

// 추천 요청(질문 입력 → 로딩 진행 상황 → 결과) 흐름 전체를 여기 한 곳에 모았다.
// InputScreen(진행 상황 표시)과 ResultsScreen(결과 데이터)이 같은 recommendMutation을
// 공유해야 해서(useMutation은 컴포넌트마다 따로 호출하면 상태가 안 섞임, useQuery처럼
// 캐시로 자동 공유되지 않음) Home에서 한 번만 호출해 두 화면에 나눠 내려준다.
export function useRecommendationFlow() {
  const { history, setHistory, input, setInput, regionId, setView } = useAppStore();
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const regionsQuery = useQuery({ queryKey: ["regions", "sido"], queryFn: fetchRegions });
  const regions = regionsQuery.data ?? [];

  // 서버/클라이언트 초기 렌더가 일치해야 하므로 고정값으로 시작하고, 마운트 후에만 랜덤화한다.
  // 순수 장식용 클라이언트 상태라 전역 스토어로 옮기지 않았다.
  const [localSuggestion, setLocalSuggestion] = useState(SUGGESTIONS[0]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 의도적으로 클라이언트에서만 랜덤화 (서버와 값이 달라도 되는 장식용 텍스트)
    setLocalSuggestion(randomSuggestion());
  }, []);

  // 에이전트가 지금 뭘 하고 있는지 보여주는 진행 상황 — 실제 도구 호출 이벤트를 그대로
  // 반영한다(가짜로 돌리는 로딩 메시지가 아님). 여러 도구가 동시에(병렬) 돌 수 있어 Set.
  const [activeTools, setActiveTools] = useState<Set<string>>(new Set());
  const [resolvingPlaces, setResolvingPlaces] = useState(false);

  function handleProgress(event: RecommendProgressEvent) {
    if (event.type === "tool_start" && event.tool) {
      setActiveTools((prev) => new Set(prev).add(event.tool!));
    } else if (event.type === "tool_end" && event.tool) {
      setActiveTools((prev) => {
        const next = new Set(prev);
        next.delete(event.tool!);
        return next;
      });
    } else if (event.type === "resolving_places") {
      setResolvingPlaces(true);
    }
  }

  const suggestMutation = useMutation({ mutationFn: postSuggest });
  const recommendMutation = useMutation({
    mutationFn: (historyWithUser: ChatTurn[]) => postRecommend(historyWithUser, handleProgress),
    onSuccess: (rec, historyWithUser) => {
      const historyWithReply: ChatTurn[] = [
        ...historyWithUser,
        { role: "assistant", content: summarize(rec) },
      ];
      setHistory(historyWithReply);
      setView(rec.needsMoreInfo ? "input" : "results");
      suggestMutation.mutate(historyWithReply);
      if (session) queryClient.invalidateQueries({ queryKey: ["recent-questions"] });
    },
    onError: () => setView("input"),
  });

  function sendMessage() {
    const text = input.trim();
    if (!text || !regionId || recommendMutation.isPending) return;

    // 지역은 대화 첫 턴에만 문장 앞에 붙인다 — 이후 턴은 이미 history에 지역이 남아있다.
    const regionName = regions.find((r) => r.id === regionId)?.name ?? "";
    const content = history.length === 0 && regionName ? `${regionName}에서 ${text}` : text;

    const historyWithUser: ChatTurn[] = [...history, { role: "user", content }];
    setHistory(historyWithUser);
    setInput("");
    recommendMutation.reset();
    suggestMutation.reset();
    setActiveTools(new Set());
    setResolvingPlaces(false);
    setView("loading");
    recommendMutation.mutate(historyWithUser);
  }

  const recommendation = recommendMutation.data ?? null;
  const promptMessage = recommendation?.needsMoreInfo ? recommendation.message : null;
  const errorMessage = recommendMutation.error instanceof Error ? recommendMutation.error.message : null;
  const displayedSuggestion =
    recommendMutation.isPending || suggestMutation.isPending
      ? ""
      : (suggestMutation.data ?? localSuggestion);
  // input 위 제안 "칩" 버튼은 실제로 서버가 준 후속 제안이 있을 때만 보여준다(첫 진입 시
  // 보여주는 무작위 localSuggestion은 입력창 안 placeholder로만 쓰고 칩으로는 안 띄움).
  const showSuggestionChip = !recommendMutation.isPending && !suggestMutation.isPending && !!suggestMutation.data;
  const progressLabel = resolvingPlaces
    ? "장소 정보 정리하는 중..."
    : activeTools.size > 0
      ? Array.from(activeTools)
          .map((t) => TOOL_LABELS[t] ?? t)
          .join(" · ")
      : "코스를 고르는 중이에요...";

  function acceptSuggestion() {
    if (!input && displayedSuggestion) setInput(displayedSuggestion);
  }

  return {
    regions,
    regionsQuery,
    recommendation,
    promptMessage,
    errorMessage,
    displayedSuggestion,
    showSuggestionChip,
    progressLabel,
    isPending: recommendMutation.isPending,
    sendMessage,
    acceptSuggestion,
  };
}

export type RecommendationFlow = ReturnType<typeof useRecommendationFlow>;
