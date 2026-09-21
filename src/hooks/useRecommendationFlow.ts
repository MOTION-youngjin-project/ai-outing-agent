"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import type { ChatTurn, Recommendation } from "@/lib/agent";
import { useAppStore } from "@/lib/store";
import {
  fetchRegions,
  postRecommend,
  postSuggest,
  type Region,
  type RecommendResult,
  type RecommendProgressEvent,
} from "@/lib/clientApi";

// 나들플랜 안드로이드 앱(webview_flutter)이 등록하는 채널 — 일반 브라우저에는 없음.
declare global {
  interface Window {
    NativeChatBridge?: { postMessage(message: string): void };
  }
}

// 진행 단계 한 줄을 그리는 데 필요한 것 — 화면(InputScreen)은 이 배열만 보고 그린다.
// done=true면 체크 표시로 접히고, false면 지금 진행 중인 한 줄이다.
export type ProgressStep = { key: string; label: string; icon: string; done: boolean };

// 에이전트가 실제로 호출한 도구 이름 → 사람이 읽는 문구.
// src/lib/tools/*.ts의 tool name과 1:1로 맞춰야 한다(빠지면 화면에 도구 이름이 그대로 뜬다).
// 문구는 "…하는 중"이 아니라 명사로 둔다 — 끝난 줄도 같은 문구로 남아서 체크만 붙기
// 때문이다("날씨 확인하는 중"에 체크가 붙으면 아직 하는 중처럼 읽힌다).
const TOOL_LABELS: Record<string, { label: string; icon: string }> = {
  get_air_quality: { label: "대기질 확인", icon: "dust" },
  get_weather: { label: "날씨 확인", icon: "sun" },
  search_culture_events: { label: "문화행사 검색", icon: "calendar" },
  search_daegu_parking: { label: "주차장 확인", icon: "parking" },
  search_daegu_pdf_guides: { label: "대구 여행자료 검색", icon: "info" },
};

// "다른 곳 추천" 버튼이 보내는 문장 — 채팅과 코스 상세가 같은 문장을 쓴다(스레드에
// 말풍선으로 남으니, 어디서 눌렀든 같은 요청으로 읽혀야 한다).
export const ANOTHER_PLACE_TEXT = "다른 곳으로 추천해줘";

// 지역을 아직 고르지 않았을 때 화면이 "선택된 것으로 보여주는" 기본 지역.
// store 값을 바꾸는 게 아니라 비어 있을 때 대신 쓰는 파생값이다 — 대화 복원
// (setRegionId)과 순서가 꼬이지 않게. 실제로 이 지역으로 보낼 때만 store에 확정한다.
const DEFAULT_REGION_NAME = "대구광역시";

// 대화 히스토리(다음 요청의 맥락)와 다음 질문 제안 생성에 쓰는 텍스트 요약.
// ResultsScreen의 "다른 곳 추천"(인라인 재요청)도 이 요약으로 history를 이어붙인다.
export function summarize(rec: Recommendation): string {
  if (rec.needsMoreInfo || !rec.places) return rec.message;
  const list = rec.places.map((p) => `- ${p.name}: ${p.oneLineDescription}`).join("\n");
  return `${rec.message}\n${list}`;
}

// 추천 요청(질문 입력 → 로딩 진행 상황 → 결과) 흐름 전체를 여기 한 곳에 모았다.
// initialRegions: 홈(/) 서버 컴포넌트가 SSR로 미리 조회해둔 시/도 목록 — regions
// useQuery의 initialData로 꽂아서 첫 로딩 깜빡임을 없앤다.
export function useRecommendationFlow(initialRegions?: Region[]) {
  const {
    history,
    setHistory,
    input,
    setInput,
    regionId,
    lastRecommendation,
    setLastRecommendation,
    recommendations,
    setRecommendations,
    conversationId,
    setConversationId,
    setRegionId,
    queuedTurn,
    setQueuedTurn,
  } = useAppStore();
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const regionsQuery = useQuery({
    queryKey: ["regions", "sido"],
    queryFn: fetchRegions,
    initialData: initialRegions,
  });
  const regions = regionsQuery.data ?? [];

  // 고른 지역이 없으면 대구를 기본으로 "보여준다"(store는 비워 둔 채).
  const defaultRegionId = regions.find((r) => r.name === DEFAULT_REGION_NAME)?.id ?? "";
  const effectiveRegionId = regionId || defaultRegionId;

  // 에이전트가 지금 뭘 하고 있는지 보여주는 진행 상황 — 전부 서버가 실제로 보낸 이벤트만
  // 기록한다(가짜로 돌리는 로딩 메시지도, 지어낸 진행률도 없다). 여러 도구가 동시에(병렬)
  // 돌 수 있어서 Set이 아니라 "호출된 순서대로 쌓이는 로그"로 둔다 — 화면에 끝난 단계를
  // 체크로 남겨두려면 끝난 뒤에도 사라지지 않아야 하기 때문.
  const [toolLog, setToolLog] = useState<{ tool: string; done: boolean }[]>([]);
  // 서버에서 이벤트가 한 번이라도 왔는지 — "질문 살펴보는 중"을 언제 체크할지 판단한다.
  const [progressSeen, setProgressSeen] = useState(false);
  const [resolvingPlaces, setResolvingPlaces] = useState(false);

  function handleProgress(event: RecommendProgressEvent) {
    setProgressSeen(true);
    if (event.type === "tool_start" && event.tool) {
      const tool = event.tool;
      setToolLog((prev) =>
        // 같은 도구를 아직 진행 중인데 또 시작할 일은 없다 — 이미 끝난 같은 도구를
        // 다시 부른 경우(모델이 재질의)는 새 줄로 쌓아서 두 번 물어본 게 보이게 한다.
        prev.some((t) => t.tool === tool && !t.done) ? prev : [...prev, { tool, done: false }]
      );
    } else if (event.type === "tool_end" && event.tool) {
      const tool = event.tool;
      setToolLog((prev) => {
        const i = prev.findIndex((t) => t.tool === tool && !t.done);
        if (i < 0) return prev;
        const next = [...prev];
        next[i] = { ...next[i], done: true };
        return next;
      });
    } else if (event.type === "resolving_places") {
      setResolvingPlaces(true);
    }
  }

  const suggestMutation = useMutation({ mutationFn: postSuggest });

  // 요청마다 번호를 붙인다 — 다시 시도하거나 질문을 고쳐 보내면 먼저 보낸 요청이
  // 뒤늦게 도착할 수 있는데(서버는 끊을 수 없다), 그 답이 새 대화 위에 덮어쓰이면
  // 카드가 두 번 붙거나 엉뚱한 질문에 답이 달린다. 가장 최근 번호의 답만 받는다.
  const requestSeq = useRef(0);

  type TurnVars = {
    historyWithUser: ChatTurn[];
    conversationId: string;
    // 이 요청이 끝났을 때 recommendations가 될 앞부분 — 보낼 때 정해두면
    // 응답이 언제 오든 이전 턴 결과를 정확히 이어 붙인다(클로저 값에 기대지 않는다).
    baseRecs: (RecommendResult | null)[];
    seq: number;
  };

  const recommendMutation = useMutation({
    mutationFn: ({ historyWithUser, conversationId }: TurnVars) =>
      postRecommend(historyWithUser, conversationId, handleProgress),
    onSuccess: (rec, { historyWithUser, baseRecs, seq }) => {
      if (seq !== requestSeq.current) return;
      const historyWithReply: ChatTurn[] = [
        ...historyWithUser,
        { role: "assistant", content: summarize(rec) },
      ];
      setHistory(historyWithReply);
      // 채팅 화면 안에 인라인 카드로 보여준다(자동으로 /recommend/[runId]로 이동하지
      // 않음) — "코스 상세 보기"를 눌러야 그 화면으로 이동한다. recommendations는 history의
      // 사용자 턴과 같은 순서로 쌓여서, 채팅 화면이 턴마다 CourseCard를 다시 그릴 때 쓴다.
      setLastRecommendation(rec);
      setRecommendations([...baseRecs, rec]);
      // 사용자가 다른 탭에 가 있는 동안 답변이 도착했으면 네이티브 챗 탭에 알림 점을 띄운다
      // — 챗 탭 안(currentIndex===0)이면 Flutter가 무시하므로 항상 호출해도 된다.
      window.NativeChatBridge?.postMessage("response-ready");
      suggestMutation.mutate(historyWithReply);
      if (session) {
        queryClient.invalidateQueries({ queryKey: ["recent-questions"] });
        queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      }
    },
    // history엔 이미 이 턴의 사용자 메시지가 들어가 있다 — 여기서 recommendations를 안
    // 늘리면 다음 턴부터 userTurns[i]<->recommendations[i] 인덱스 매칭이 영구적으로 한
    // 칸씩 어긋난다. null로 자리만 채운다(다시 시도하면 이 자리를 갈아끼운다).
    onError: (_err, { baseRecs, seq }) => {
      if (seq !== requestSeq.current) return;
      setRecommendations([...baseRecs, null]);
    },
  });

  // 보내기·다시 시도·질문 고치기가 전부 이 한 길로 간다.
  // baseHistory: 이 질문 앞까지의 대화, baseRecs: 그 대화에 달린 추천들.
  function submitTurn(baseHistory: ChatTurn[], baseRecs: (RecommendResult | null)[], content: string) {
    const historyWithUser: ChatTurn[] = [...baseHistory, { role: "user", content }];
    // 이 대화의 첫 turn이면(사이드바 "새 질문"으로 시작했거나 아직 한 번도 안 보낸 상태)
    // 새 conversationId를 발급한다 — 과거 대화를 이어서 보내는 중이면 이미 store에 있는
    // 값을 그대로 재사용해서 같은 대화로 계속 묶인다.
    const activeConversationId = conversationId ?? crypto.randomUUID();
    if (!conversationId) setConversationId(activeConversationId);
    setHistory(historyWithUser);
    setRecommendations(baseRecs);
    recommendMutation.reset();
    suggestMutation.reset();
    setToolLog([]);
    setProgressSeen(false);
    setResolvingPlaces(false);
    requestSeq.current += 1;
    recommendMutation.mutate({
      historyWithUser,
      conversationId: activeConversationId,
      baseRecs,
      seq: requestSeq.current,
    });
  }

  // 첫 질문 앞에는 지역을 붙여 보낸다("대구광역시에서 …").
  const regionName = regions.find((r) => r.id === effectiveRegionId)?.name ?? "";
  const regionPrefix = regionName ? `${regionName}에서 ` : "";

  // 지금 대화에 사용자 턴 하나를 붙여 보내는 유일한 입구 — 입력창 보내기, "다른 곳
  // 추천", 코스 상세에서 넘어온 요청이 전부 여기로 온다. 추천 요청(= 크레딧 차감)은
  // 사용자가 보내기/다른 곳 추천을 직접 눌렀을 때만 이 함수를 부른다. 칩은 입력창을
  // 채우기만 하고 부르지 않는다.
  function sendTurn(raw: string) {
    const text = raw.trim();
    if (!text || !effectiveRegionId || recommendMutation.isPending) return false;
    // 기본값(대구)으로 보낸 거라면 이제 사용자가 고른 지역으로 확정한다 — 지도·상세
    // 화면의 날씨가 store의 지역을 본다.
    if (!regionId) setRegionId(effectiveRegionId);
    // 지역은 대화 첫 턴에만 문장 앞에 붙인다 — 이후 턴은 이미 history에 지역이 남아있다.
    const content = history.length === 0 ? `${regionPrefix}${text}` : text;
    submitTurn(history, recommendations, content);
    return true;
  }

  function sendMessage() {
    if (sendTurn(input)) setInput("");
  }

  // 성공한 답 아래 "다른 곳 추천" — 이전 답은 지우지 않고 새 턴을 붙인다.
  function requestAnother() {
    sendTurn(ANOTHER_PLACE_TEXT);
  }

  // 코스 상세 화면의 "다른 곳 추천"은 그 화면에서 요청하지 않고 채팅으로 돌아와서
  // 보낸다(store.queuedTurn) — 진행 단계와 새 카드가 대화 안에 그대로 쌓이게.
  // 꺼내는 즉시 비워서 두 번 보내지 않는다.
  useEffect(() => {
    if (!queuedTurn || recommendMutation.isPending || !effectiveRegionId) return;
    // 한 틱 미뤄서 보낸다 — 개발 모드의 이중 effect에서도 cleanup이 앞의 예약을
    // 지우므로 딱 한 번만 나간다.
    const id = window.setTimeout(() => {
      setQueuedTurn(null);
      sendTurn(queuedTurn);
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 큐가 채워졌을 때 한 번만 꺼낸다
  }, [queuedTurn, effectiveRegionId]);

  // i번째 사용자 질문 "앞까지"의 대화 — history는 사용자/AI가 번갈아 쌓여 있다.
  function historyBeforeUserTurn(i: number): ChatTurn[] {
    let seen = -1;
    for (let k = 0; k < history.length; k++) {
      if (history[k].role === "user") {
        seen += 1;
        if (seen === i) return history.slice(0, k);
      }
    }
    return history;
  }

  // 마지막 질문을 그대로 다시 보낸다 — 실패했거나 응답이 너무 늦어 멈춘 것 같을 때만.
  // (정상으로 받은 답이 마음에 안 들 때는 답을 지우지 않는 requestAnother를 쓴다.)
  // 진행 중이어도 누를 수 있다: 먼저 보낸 요청은 번호가 밀려서 도착해도 버려진다.
  function retryLast() {
    const userCount = history.filter((t) => t.role === "user").length;
    if (userCount === 0) return;
    const i = userCount - 1;
    const base = historyBeforeUserTurn(i);
    const last = history[base.length];
    if (!last || last.role !== "user") return;
    submitTurn(base, recommendations.slice(0, i), last.content);
  }

  // i번째 질문을 고쳐서 다시 보낸다 — 그 뒤의 대화는 고친 질문을 전제로 한 게 아니라서
  // 전부 걷어낸다(채팅 앱에서 메시지를 수정하면 그 아래가 새로 이어지는 것과 같다).
  // 말풍선에 보이던 문장을 그대로 고치게 하고, 고친 문장을 그대로 보낸다 — 예전엔
  // 첫 질문의 "대구광역시에서 "를 떼고 보여줘서 말풍선과 고치는 창의 글이 달랐다.
  function editTurn(i: number, text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    submitTurn(historyBeforeUserTurn(i), recommendations.slice(0, i), trimmed);
  }

  // 평소 응답은 10초 안팎인데 40초가 넘어가면 "멈춘 것 같다"고 알리고 다시 시도를
  // 권한다. 타이머는 진행 중일 때만 돌고, 끝나면 바로 풀린다.
  const [isSlow, setIsSlow] = useState(false);
  useEffect(() => {
    if (!recommendMutation.isPending) return;
    const id = window.setTimeout(() => setIsSlow(true), 40_000);
    return () => {
      window.clearTimeout(id);
      setIsSlow(false);
    };
  }, [recommendMutation.isPending, recommendMutation.submittedAt]);

  const recommendation = lastRecommendation;
  const errorMessage = recommendMutation.error instanceof Error ? recommendMutation.error.message : null;
  // 후속 제안은 "지금 하고 있는 대화"에 딸린 것이다 — 대화를 비우면(새 질문, 채팅
  // 나가기) 맥락이 사라졌는데도 이전 대화의 제안이 홈 화면에 그대로 떠 있었다.
  // suggestMutation은 화면 밖(홈/결과 화면)에서 초기화할 방법이 없어서, 값을 지우는
  // 대신 "대화 중일 때만 쓴다"로 막는다 — 어디서 비우든 항상 맞다.
  const followUp = history.length > 0 ? suggestMutation.data : undefined;
  // 예전엔 제안 문장을 입력창 위에 흐리게 겹쳐 그렸다 — 이미 적힌 질문처럼 보이는데
  // 모바일에선 받아들일 방법(Tab/→)이 없어서, 그대로 보내면 아무 일도 없었다.
  // 이제 제안은 칩으로만 보여주고, 입력창에는 진짜 placeholder만 둔다.
  const displayedSuggestion =
    recommendMutation.isPending || suggestMutation.isPending ? "" : (followUp ?? "");
  const showSuggestionChip = !recommendMutation.isPending && !suggestMutation.isPending && !!followUp;
  // 한 줄짜리 문구 대신 "지금까지 끝낸 단계 + 지금 하는 단계" 목록을 만든다.
  // 규칙은 하나뿐이다: 서버가 알려준 사실만 줄로 만든다.
  //  - 1번 줄(질문 살펴보는 중)은 항상 있다. 서버에서 첫 이벤트가 오면 = 모델이 뭘 할지
  //    정한 것이므로 체크한다.
  //  - 도구 줄은 tool_start로 생기고 tool_end로 체크된다(실제 호출 그대로).
  //  - 도구가 다 끝났는데 아직 결과 전이면 모델이 다시 답을 쓰는 중이다.
  //  - resolving_places가 오면 그 뒤로는 카카오 매칭·경로 계산·기록 저장 구간이다.
  // 남은 단계가 몇 개인지는 서버가 알려주지 않으므로 %도, 전체 개수도 만들지 않는다.
  const progressSteps: ProgressStep[] = (() => {
    const steps: ProgressStep[] = [
      { key: "read", label: "질문 확인", icon: "sparkle", done: progressSeen },
    ];
    toolLog.forEach((t, i) => {
      const meta = TOOL_LABELS[t.tool];
      steps.push({
        key: `tool-${i}-${t.tool}`,
        label: meta?.label ?? t.tool,
        icon: meta?.icon ?? "search",
        // resolving_places까지 왔으면 도구 구간은 이미 지난 것이다(tool_end를 놓쳐도 체크).
        done: t.done || resolvingPlaces,
      });
    });
    if (resolvingPlaces) {
      steps.push({ key: "places", label: "실제 장소 정보 확인", icon: "pin", done: false });
    } else if (progressSeen && toolLog.every((t) => t.done)) {
      // 도구를 한 번이라도 썼으면 "모은 정보로", 아니면 미리 받아둔 날씨·자료로 고르는 중.
      steps.push({
        key: "pick",
        label: toolLog.length > 0 ? "모은 정보로 고르기" : "추천할 곳 고르기",
        icon: "compass",
        done: false,
      });
    }
    return steps;
  })();

  // 후속 제안 칩 — 문장을 입력창에 넣기만 한다(보내기는 사용자가 직접).
  function acceptSuggestion() {
    if (displayedSuggestion) setInput(displayedSuggestion);
  }

  return {
    regions,
    regionsQuery,
    recommendation,
    errorMessage,
    displayedSuggestion,
    showSuggestionChip,
    progressSteps,
    isPending: recommendMutation.isPending,
    isSlow,
    effectiveRegionId,
    sendMessage,
    requestAnother,
    retryLast,
    editTurn,
    acceptSuggestion,
  };
}

export type RecommendationFlow = ReturnType<typeof useRecommendationFlow>;
