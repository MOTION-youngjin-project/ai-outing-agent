"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import {
  fetchWeather,
  fetchAirQuality,
  fetchPlacesSearch,
  fetchCulturalEvents,
  type RecommendResult,
} from "@/lib/clientApi";
import type { RecommendationFlow } from "@/hooks/useRecommendationFlow";
import { Icon } from "@/components/Icon";
import { SidebarToggleButton } from "@/components/SidebarToggleButton";
import { CourseCard } from "@/components/CourseCard";
import { RecommendProgress } from "@/components/RecommendProgress";
import { RegionPicker } from "@/components/RegionPicker";
import { Logo } from "@/components/Logo";
import { HeroAtmosphere } from "@/components/HeroAtmosphere";
import { HourlyWeatherPopover } from "@/components/HourlyWeatherPopover";
import { shortRegionName } from "@/lib/services/matching";

// 결과 화면에서도 쓰는 것과 같은 문구 — 결과 화면은 홈으로 이동해 채우지만, 여긴 이미
// 홈(채팅)이라 입력창에 바로 채우기만 하면 된다.
// 누르면 완성된 문장을 입력창에 넣고 포커스만 준다 — 보내기는 사용자가 직접 누른다.
// 추천 요청 1회가 크레딧 1개라, 칩을 잘못 눌렀다고 요청이 나가면 안 된다.
// 문장을 다 써서 넣는 건 보낸 뒤 말풍선으로 남았을 때 무슨 요청이었는지 읽히게 하려는 것.
const QUICK_REFINEMENTS = [
  { label: "주차 가능한 곳", text: "주차 가능한 곳 위주로 다시 추천해줘" },
  { label: "더 저렴하게", text: "비용이 덜 드는 곳으로 다시 추천해줘" },
  { label: "실내 위주로", text: "실내 위주로 다시 추천해줘" },
] as const;

// 클릭하면 입력창에 문구만 채워넣는 보조 칩(제출은 안 함) — 별도 필터 상태를 만들지 않는다.
const QUICK_PROMPTS = [
  { label: "데이트", icon: "heart", text: "여자친구랑 데이트할만한 곳 있어?" },
  { label: "아이와 함께", icon: "users", text: "아이와 함께 갈 만한 곳 있어?" },
  { label: "혼자", icon: "user", text: "혼자 조용히 갈 만한 곳 있어?" },
  { label: "저비용", icon: null, text: "돈 안 쓰고 반나절 나갔다 올 데 있어?" },
] as const;

// src/lib/tools/culturePortal.ts의 DTYPES와 같은 값 — 서버 전용 도구 모듈을 클라이언트
// 번들에 끌어오지 않으려고 여기 따로 둠(같은 파일이 @langchain/core/tools도 import함).
const CULTURE_DTYPES = [
  "연극",
  "뮤지컬",
  "오페라",
  "음악",
  "콘서트",
  "국악",
  "무용",
  "전시",
  "기타",
] as const;

// 채팅을 떠날 때의 스크롤 위치 — 뒤로 돌아왔을 때 제자리로 되돌리는 데만 쓴다.
// 앱 안에서만 의미 있는 값이라 모듈 변수로 둔다(새로고침하면 사라진다).
let lastChatScroll: { turns: number; y: number } | null = null;

export function InputScreen({ flow }: { flow: RecommendationFlow }) {
  const {
    input,
    setInput,
    regionId,
    setRegionId,
    history,
    setHistory,
    setLastRecommendation,
    recommendations,
    setRecommendations,
    setConversationId,
  } = useAppStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    regions,
    recommendation,
    errorMessage,
    quotaExceeded,
    displayedSuggestion,
    showSuggestionChip,
    progressSteps,
    isPending,
    isSlow,
    sendMessage,
    retryLast,
    requestAnother,
    effectiveRegionId,
    editTurn,
    acceptSuggestion,
  } = flow;

  // 내 질문 고치기 — 어느 말풍선을 고치는 중인지와 고치는 중인 문구.
  // 보내면 그 질문 뒤의 대화는 걷어내고 고친 질문부터 새로 이어진다(editTurn).
  const [editing, setEditing] = useState<{
    index: number;
    text: string;
  } | null>(null);
  function submitEdit() {
    if (!editing || !editing.text.trim()) return;
    editTurn(editing.index, editing.text);
    setEditing(null);
  }

  // 질문을 보내는 순간 홈 화면 대신 채팅 스레드 형태로 전환한다(디자인/채팅.png).
  // 예전엔 `!!recommendation`이라 첫 답이 도착할 때까지(9초+) 홈 화면에 그대로 머물면서
  // 지역 선택·검색 패널 사이에 로딩만 떴다 — 보낸 게 어디로 갔는지 안 보였다.
  // history가 생기는 건 sendMessage가 사용자 턴을 넣는 즉시라, 보내자마자 내 말풍선이
  // 뜨고 그 아래에서 진행 단계가 쌓인다. "새 질문"을 눌러야 다시 홈 화면으로 돌아간다
  // (startNewQuestion이 history와 lastRecommendation을 함께 비운다).
  const inConversation = history.length > 0 || !!recommendation;
  // 대화 전체를 턴 단위로 다시 그린다 — recommendations는 history의 사용자 턴과 같은
  // 순서로 쌓여있어서 인덱스로 짝지을 수 있다(아직 응답 안 온 마지막 턴은 recommendations
  // 쪽이 하나 짧아서 자연히 AI 블록 없이 사용자 말풍선만 뜬다).
  const userTurns = history.filter((t) => t.role === "user");
  const regionName = regions.find((r) => r.id === effectiveRegionId)?.name;

  // 새 턴이 붙었을 때만 맨 아래(= 답변 끝 + 입력창)로 따라 내려간다.
  // 턴 수가 그대로면 아무것도 하지 않으므로, 사용자가 위로 올려 기록을 읽는 중에
  // 화면이 멋대로 튀지 않는다. 레이아웃이 반영된 다음 프레임에 재야 높이가 맞다.
  //
  // 다른 화면(장소 상세·코스 상세)에 갔다가 뒤로 돌아온 경우는 예외다 — 화면이 새로
  // 마운트되면서 turnCount effect가 다시 돌아 맨 아래로 내려가 버려, 보던 카드를
  // 다시 찾아 올라가야 했다. 떠날 때의 위치를 기억해 뒀다가(아래 scroll 리스너),
  // 턴 수가 그때와 같으면 그 자리로 되돌린다. 턴이 늘었으면 평소처럼 맨 아래로.
  const turnCount = history.length;
  const [restoreY] = useState(() =>
    lastChatScroll && lastChatScroll.turns === history.length
      ? lastChatScroll.y
      : null,
  );
  const [mountTurnCount] = useState(turnCount);
  useEffect(() => {
    if (turnCount === 0) return;
    if (restoreY !== null && turnCount === mountTurnCount) {
      const id = requestAnimationFrame(() =>
        window.scrollTo({ top: restoreY }),
      );
      return () => cancelAnimationFrame(id);
    }
    const id = requestAnimationFrame(() => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "smooth",
      });
    });
    return () => cancelAnimationFrame(id);
  }, [turnCount, restoreY, mountTurnCount]);
  useEffect(() => {
    function remember() {
      // 다른 화면으로 넘어가는 순간 라우터가 새 화면 맨 위로 스크롤하는데, 그때도 이
      // 화면이 아직 붙어 있어서 그 값(맨 위)이 기억됐다(실측). 주소가 이미 바뀌었으면
      // 이 화면의 스크롤이 아니므로 무시한다.
      if (window.location.pathname !== "/") return;
      lastChatScroll = {
        turns: useAppStore.getState().history.length,
        y: window.scrollY,
      };
    }
    window.addEventListener("scroll", remember, { passive: true });
    return () => window.removeEventListener("scroll", remember);
  }, []);

  // 진행 단계가 한 줄 늘어나면 패널이 그만큼 아래로 자라서 새 줄이 화면 밖으로 밀린다.
  // 맨 아래를 보고 있던 사람만 따라 내려간다 — 위로 올려 기록을 읽는 중이면 그대로 둔다.
  const stepCount = isPending ? progressSteps.length : 0;
  useEffect(() => {
    if (stepCount === 0) return;
    const doc = document.documentElement;
    // 방금 늘어난 높이(한 줄 ≈ 44px)까지 감안해 "거의 바닥"을 넉넉히 잡는다.
    if (window.innerHeight + window.scrollY < doc.scrollHeight - 160) return;
    const id = requestAnimationFrame(() => {
      window.scrollTo({ top: doc.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [stepCount]);

  function startNewQuestion() {
    setHistory([]);
    setInput("");
    setLastRecommendation(null);
    setRecommendations([]);
    setConversationId(null);
  }

  // 칩은 문장을 넣고 입력창에 포커스만 준다(보내기는 사용자가). 커서는 문장 끝에.
  const inputRef = useRef<HTMLInputElement>(null);
  function focusInput() {
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    });
  }
  function fillInput(text: string) {
    setInput(text);
    focusInput();
  }

  function openCourseDetail(rec: RecommendResult) {
    queryClient.setQueryData(["recommend", rec.agentRunId], rec);
    router.push(`/recommend/${rec.agentRunId}`);
  }

  // 지역을 아직 안 골랐어도 대구를 기본으로 보여준다(effectiveRegionId) — 상단 배지,
  // 지역 선택 창, 보내기가 전부 같은 값을 본다.
  const badgeRegionId = effectiveRegionId;
  const weatherQuery = useQuery({
    queryKey: ["weather", badgeRegionId],
    queryFn: () => fetchWeather(badgeRegionId),
    enabled: !!badgeRegionId,
  });
  const airQualityQuery = useQuery({
    queryKey: ["air-quality", effectiveRegionId],
    queryFn: () => fetchAirQuality(effectiveRegionId),
    enabled: !!effectiveRegionId,
  });

  // 검색창 입력값은 제출 전까지 이 화면 밖에서 쓸 일이 없는 순수 로컬 상태라 스토어로 안 옮김.
  const [placeQuery, setPlaceQuery] = useState("");
  const placesMutation = useMutation({ mutationFn: fetchPlacesSearch });

  // 홈 아래쪽 보조 검색(장소·문화행사)은 기본으로 접어둔다 — 첫 화면은 "질문 하나"에
  // 집중시키고, 필요한 사람만 펼친다. 이 화면 밖에서 쓸 일이 없어 스토어로 안 옮김.
  const [extrasOpen, setExtrasOpen] = useState(false);
  const extrasRef = useRef<HTMLDivElement>(null);
  const topbarRef = useRef<HTMLDivElement>(null);

  // 펼치면 펼쳐진 곳으로 따라 내려간다 — 버튼이 화면 아래쪽에 있어서, 누르면
  // 열리긴 하는데 정작 열린 내용은 화면 밖이라 아무 일도 안 일어난 것처럼 보였다.
  // DOM에 붙은 다음 프레임에 재야 위치가 맞고, 고정된 상단 바 높이만큼은 비켜간다
  // (scroll-margin-top을 요소에 직접 줘서 scrollIntoView가 알아서 빼게 한다).
  useEffect(() => {
    if (!extrasOpen) return;
    const id = requestAnimationFrame(() => {
      const el = extrasRef.current;
      if (!el) return;
      // 상단 바가 고정이라 그 높이만큼 덜 내려가야 첫 패널 머리가 안 가린다.
      // 실제 높이를 그때 재서 넣는다(기기마다 안전영역 때문에 다르다).
      el.style.scrollMarginTop = `${(topbarRef.current?.offsetHeight ?? 76) + 12}px`;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
  }, [extrasOpen]);

  const [cultureDtype, setCultureDtype] = useState<
    (typeof CULTURE_DTYPES)[number]
  >(CULTURE_DTYPES[0]);
  const [cultureKeyword, setCultureKeyword] = useState("");
  const cultureMutation = useMutation({ mutationFn: fetchCulturalEvents });

  return (
    <>
      {/* 상단 바는 스크롤해도 따라온다(sk-topbar) — 대화가 길어지면 위로 올려
          읽다가 기록·나가기 버튼이 화면 밖으로 사라졌다.
          헤더가 화면 끝에 붙어 있어 꽉 차 보이던 것도 같이 틔운다(노치 포함). */}
      <div
        ref={topbarRef}
        // 홈은 바가 아니라 버튼만 띄운다(sk-bar-plain) — 불투명한 띠가 배경
        // 애니메이션을 가로로 잘라먹는다. 대화 화면에서만 붙박이 바가 된다.
        className={`sk-bar ${inConversation ? "sk-topbar" : "sk-bar-plain"}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <SidebarToggleButton filled={inConversation} />
          <Logo className="h-[21px]" priority />
        </div>
        {inConversation ? (
          // 예전엔 +(새 질문)와 나가기 둘 다 있었는데 누르면 똑같이 대화를 비우고
          // 홈으로 갔다 — 같은 일을 하는 버튼 둘은 고르게 만들 뿐이라 하나로 줄였다.
          <button
            onClick={startNewQuestion}
            aria-label="홈으로 나가기"
            className="sk sk-primary sk-slot h-9 w-9"
          >
            <Icon name="exit" className="h-4 w-4" />
          </button>
        ) : (
          weatherQuery.data && (
            <HourlyWeatherPopover
              regionName={shortRegionName(
                regions.find((r) => r.id === badgeRegionId)?.name ?? "",
              )}
              weather={weatherQuery.data}
            />
          )
        )}
      </div>
      {/* 대기 레이어는 본문 전체 뒤에 깔린다(absolute z-0). 내용은 통째로 z-10
          한 겹 위로 올려서, 배경이 어디까지 번지든 글자·카드를 덮지 않는다.
          래퍼가 flex-1을 이어받으므로 아래 고정 입력창(mt-auto)도 그대로 동작한다. */}
      <div className="relative flex flex-1 flex-col px-5">
        {!inConversation && <HeroAtmosphere weather={weatherQuery.data} />}
        <div
          className={`sk-under-overlay relative z-10 flex flex-1 flex-col ${inConversation ? "gap-3" : "gap-4"}`}
        >
          {!inConversation && (
            <>
              {/* Hero — 이 두 덩이(제목 + 설명)를 기준으로 위아래를 크게 비운다.
                화면에서 제일 먼저 읽히는 자리라 주변이 비어 있을수록 또렷하다. */}
              {/* 크기·여백은 globals.css의 .sk-hero*가 들고 있다 — 유틸리티로 두면
                Tailwind가 그 값을 생성 못 했을 때 제목이 16px로 내려앉는다(실측). */}
              <div className="sk-enter sk-hero">
                <h1 className="sk-hero-title">어디로 나가볼까요?</h1>
                <p className="sk-hero-sub">
                  지역을 고르고 하고 싶은 걸 편하게 적어주세요.
                  <br />
                  날씨와 대기질을 함께 확인해서 코스를 추천해드려요.
                </p>
              </div>

              {/* 날씨·대기질은 지역 선택 "위"에 둔다 — 아래에 두면 지역을 고르는 순간
                이 줄이 새로 생기면서 입력창과 칩이 통째로 아래로 밀려난다.
                위에 있으면 밀리는 건 제목 쪽 여백뿐이라 손이 가는 자리는 안 움직인다. */}
              {!!regionId && (weatherQuery.data || airQualityQuery.data) && (
                <div className="sk-panel sk-enter flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-[13px]">
                  {airQualityQuery.data && (
                    <span className="flex items-center gap-1.5">
                      <span className="sk-slot h-7 w-7">
                        <Icon name="dust" className="h-[16px] w-[16px]" />
                      </span>
                      <span className="text-muted">미세먼지</span>
                      <span className="font-semibold text-accent">
                        {airQualityQuery.data.overallGrade}
                      </span>
                    </span>
                  )}
                  {weatherQuery.data && (
                    <span className="flex items-center gap-1.5">
                      <Icon
                        name="sun"
                        className="h-[18px] w-[18px] text-amber-400"
                      />
                      <span className="font-medium text-ink-soft">
                        {weatherQuery.data.temperatureC !== null
                          ? `${weatherQuery.data.temperatureC}°C · `
                          : ""}
                        {weatherQuery.data.summary}
                      </span>
                    </span>
                  )}
                </div>
              )}

              {/* 브라우저 기본 <select>는 열면 운영체제가 그린 목록이 떠서(파란 선택 막대,
                시스템 글꼴) 이 줄만 다른 앱처럼 보였다 — 조건 필터와 같은 방식의
                우리 창으로 바꿨다. 고르는 값(regionId)은 그대로다. */}
              <div className="sk-enter">
                <RegionPicker
                  regions={regions}
                  value={effectiveRegionId}
                  onChange={setRegionId}
                  disabled={isPending}
                />
              </div>
            </>
          )}

          {/* 스레드의 구조·데이터 흐름은 develop 그대로다(턴별 recommendations[i],
            마지막 턴에만 현재 날씨/대기질). 바뀐 건 className뿐 — 40ms 간격으로
            올라오고(sk-stagger), 말풍선/패널/아바타가 SOCKET 조형을 따른다. */}
          {inConversation && (
            <div className="sk-stagger flex flex-col gap-4 pt-2">
              {userTurns.map((turn, i) => {
                const rec = recommendations[i];
                const isLast = i === userTurns.length - 1;
                const turnHasCourse =
                  !!rec && !rec.needsMoreInfo && (rec.places?.length ?? 0) > 0;
                return (
                  <div key={i} className="flex flex-col gap-3">
                    {editing?.index === i ? (
                      <form
                        className="sk-edit-box sk-enter ml-auto flex w-[85%] flex-col gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          submitEdit();
                        }}
                      >
                        <textarea
                          autoFocus
                          value={editing.text}
                          onChange={(e) =>
                            setEditing({ index: i, text: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setEditing(null);
                            if (
                              e.key === "Enter" &&
                              !e.shiftKey &&
                              !e.nativeEvent.isComposing
                            ) {
                              e.preventDefault();
                              submitEdit();
                            }
                          }}
                          rows={3}
                          aria-label="질문 고치기"
                          className="sk-edit-input"
                        />
                        {!isLast && (
                          <p className="text-[11px] leading-snug text-muted">
                            다시 보내면 이 질문 아래 대화는 지워지고 여기서부터
                            새로 이어져요.
                          </p>
                        )}
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="sk sk-edit-action"
                          >
                            취소
                          </button>
                          <button
                            type="submit"
                            disabled={!editing.text.trim() || isPending}
                            className="sk sk-primary sk-edit-action"
                          >
                            다시 보내기
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="sk-user-row flex items-end justify-end gap-1.5">
                        {/* 답을 기다리는 중에는 고칠 수 없다 — 받는 중인 답이 어느 질문의
                          답인지 헷갈린다. 끝나면(성공이든 실패든) 다시 뜬다. */}
                        {!isPending && (
                          <button
                            type="button"
                            onClick={() =>
                              setEditing({ index: i, text: turn.content })
                            }
                            aria-label="이 질문 고치기"
                            title="질문 고치기"
                            className="sk-edit-btn"
                          >
                            <Icon name="edit" className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <div className="max-w-[85%] rounded-[16px_4px_3px_16px] bg-mint-bg px-4 py-2.5 text-[14px] leading-relaxed text-ink">
                          {turn.content}
                        </div>
                      </div>
                    )}
                    {rec && (
                      <div className="flex items-start gap-2">
                        <span className="sk-slot mt-0.5 h-7 w-7">
                          <Icon
                            name="sparkle"
                            className="h-4 w-4 text-mint-mid"
                          />
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <span className="text-[12px] font-semibold text-muted">
                            AI 추천
                          </span>
                          {rec.needsMoreInfo && (
                            <div className="sk-panel border-accent/30 bg-mint-bg px-4 py-3.5">
                              <p className="text-[14px] leading-relaxed text-ink">
                                {rec.message}
                              </p>
                            </div>
                          )}
                          {turnHasCourse && (
                            <>
                              <CourseCard
                                recommendation={rec}
                                regionName={regionName}
                                // 지난 턴의 그때 그 순간 날씨/대기질은 저장돼 있지 않다 —
                                // 지금 값을 보여줘도 되는 건 가장 최근 턴뿐이다.
                                weather={isLast ? weatherQuery.data : undefined}
                                airQuality={
                                  isLast ? airQualityQuery.data : undefined
                                }
                                onOpenDetail={() => openCourseDetail(rec)}
                              />
                              {rec.message && (
                                <div className="sk-panel px-4 py-3.5 text-[13px] leading-relaxed text-ink-soft">
                                  {rec.message}
                                </div>
                              )}
                            </>
                          )}
                          {/* 정상으로 받은 답이어도 마음에 안 들 수 있다 — 이 답은 그대로 두고
                            "다른 곳으로 추천해줘"를 새 턴으로 붙인다(비교할 수 있게).
                            최신 답에만 둔다: 지난 답에서 갈라지는 건 질문 고치기로 한다. */}
                          {isLast && !isPending && turnHasCourse && (
                            <div className="flex justify-start">
                              <button
                                type="button"
                                onClick={requestAnother}
                                className="sk sk-notice-btn"
                              >
                                <Icon name="retry" className="h-3.5 w-3.5" />
                                다른 곳 추천
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 조회 중 — 답변이 들어올 자리에 그대로 둔다(아바타·들여쓰기가 실제 답변과
                같아서, 답이 오면 이 자리에 카드가 앉는다). 패널 위로 느린 스캔 밴드가
                왕복하고, 단계가 하나 끝날 때마다 줄이 체크로 접히며 다음 줄이 열린다. */}
              {isPending && (
                <div className="flex items-start gap-2">
                  <span className="sk-slot mt-0.5 h-7 w-7">
                    <Icon name="sparkle" className="h-4 w-4 text-mint-mid" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="text-[12px] font-semibold text-muted">
                      AI 추천
                    </span>
                    <RecommendProgress steps={progressSteps} />
                    {/* 가끔 요청이 응답 없이 멈춘다 — 평소(10초 안팎)보다 한참 늦으면
                      기다리게만 두지 말고 다시 보낼 길을 연다. 먼저 보낸 요청은
                      늦게 도착해도 버려진다(useRecommendationFlow의 requestSeq). */}
                    {isSlow && (
                      <div className="sk-enter sk-notice">
                        <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink-soft">
                          응답이 평소보다 늦어요. 멈춘 것 같으면 다시 보내
                          보세요.
                        </p>
                        <button
                          type="button"
                          onClick={retryLast}
                          className="sk sk-notice-btn"
                        >
                          <Icon name="retry" className="h-3.5 w-3.5" />
                          다시 시도
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 실패하면 원인을 보여준다.
            질문 한도 초과면 다시 시도해도 같은 결과라 광고 화면으로 보내고,
            일반 오류면 마지막 질문을 그대로 다시 보낼 수 있게 한다. */}
          {errorMessage && !isPending && (
            <div className="sk-enter sk-notice sk-notice-error" role="alert">
              <p className="min-w-0 flex-1 text-[13px] leading-snug">
                {errorMessage}
              </p>

              {quotaExceeded ? (
                <Link href="/ads" className="sk sk-notice-btn">
                  광고 보고 질문권 받기
                </Link>
              ) : (
                userTurns.length > 0 && (
                  <button
                    type="button"
                    onClick={retryLast}
                    className="sk sk-notice-btn"
                  >
                    <Icon name="retry" className="h-3.5 w-3.5" />
                    다시 시도
                  </button>
                )
              )}
            </div>
          )}

          {/* 입력창 — 대화 중에는 화면 하단에 붙어 있어야 한다(스크롤로 사라지면
            위로 기록을 읽다가 질문을 못 한다). position:sticky라 자리를 그대로
            차지하므로 별도 여백 계산이 필요 없고, 맨 아래까지 내리면 제자리에 앉는다.
            bottom은 탭바 높이(--sk-dock)에서 10px 빼서 아래끝이 탭바에 살짝 물리게
            한다 — 그래야 둘 사이 틈으로 본문이 비쳐 보이지 않는다.
            탭바가 없는 lg에서는 0이다.
            mt-auto는 sticky만으로 부족한 경우를 메운다: 대화가 짧아 본문이 화면보다
            작으면 sticky가 걸릴 자리가 없어서 입력창이 본문 바로 아래(화면 중간)에
            떠 있었다. 부모가 flex-1로 화면 높이를 채우므로 mt-auto가 남는 공간을
            전부 위로 밀어 입력창을 늘 맨 아래에 앉힌다.
            mb -22px는 그 두 자리를 정확히 같은 높이로 맞춘다: 붙어 있을 때(sticky)는
            화면 아래에서 --sk-dock-10px, 흘러갈 때(mt-auto)는 AppShell의 아래 여백
            --sk-dock+12px 위라서 22px 차이가 난다 — 답이 도착해 sticky로 바뀌는
            순간 입력창이 그만큼 튀어 보인다. lg에서는 탭바가 없어 0이다. */}
          <div
            className={
              inConversation
                ? "sticky bottom-[calc(var(--sk-dock)-10px+env(safe-area-inset-bottom))] z-10 -mx-5 mb-[-22px] mt-auto flex flex-col gap-2 border-t border-[var(--sk-line-soft)] bg-page/95 px-5 pb-3 pt-2.5 backdrop-blur lg:mb-0 lg:bottom-0"
                : "flex flex-col gap-2 pt-2"
            }
          >
            {showSuggestionChip && !input && (
              <button
                type="button"
                onClick={() => {
                  acceptSuggestion();
                  focusInput();
                }}
                className="sk sk-on flex max-w-full items-center gap-1.5 self-start px-3.5 py-1.5 text-[13px]"
              >
                <Icon name="sparkle" className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 truncate">{displayedSuggestion}</span>
              </button>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="sk-input flex items-center gap-2 p-1.5 pl-4"
            >
              <div className="relative flex-1">
                {/* 예전엔 제안 문장을 입력창 위에 흐리게 겹쳐 그려서, 이미 적힌 질문처럼
                  보였다(그대로 보내면 빈 입력이라 아무 일도 없었다). 이제 진짜
                  placeholder만 둔다 — "예:"로 시작해서 예시라는 게 글자로 보인다. */}
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isPending}
                  placeholder={
                    inConversation
                      ? "더 궁금한 걸 물어보세요"
                      : "예: 여자친구랑 데이트할 만한 곳 있어?"
                  }
                  aria-label="질문 입력"
                  className="relative w-full bg-transparent py-2 text-[15px] text-ink outline-none placeholder:text-muted/60 disabled:opacity-50"
                />
              </div>
              {/* 비어 있으면 누를 수 없는 모양 — 누를 수 있어 보이는데 아무 일도 없는
                상태를 없앤다. */}
              <button
                type="submit"
                disabled={isPending || !effectiveRegionId || !input.trim()}
                aria-label="보내기"
                className={`sk sk-primary sk-slot h-10 w-10 ${isPending ? "sk-loading" : ""}`}
              >
                <Icon name="send" className="h-[18px] w-[18px]" />
              </button>
            </form>

            {/* 지역을 안 고르면 보내기 버튼이 비활성이라 클릭도 Enter도 아무 일이 안 일어난다
              (비활성 submit 버튼은 Enter 암묵 제출까지 막는다) — 이유를 안 알려주면 앱이
              먹통인 걸로 보인다. 지역을 고르면 저절로 사라지는 파생 렌더링. */}
            {!effectiveRegionId && input.trim() && (
              <p className="px-4 text-[13px] text-red-600">
                위에서 지역을 먼저 선택해주세요.
              </p>
            )}

            {/* sk-reel — 그냥 잘리는 가로 스크롤 대신 가장자리에서 녹아 사라지고,
              들어오는 칩이 아래에서 솟아오른다. 아래 여백은 칩의 단차(그림자)가
              마스크에 잘리지 않을 만큼 둔다. */}
            <div
              className={`sk-reel sk-stagger gap-2 ${
                inConversation
                  ? `pb-2 pt-1 ${input ? "hidden" : ""}`
                  : "pb-3 pt-1"
              }`}
            >
              {inConversation
                ? QUICK_REFINEMENTS.map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      disabled={isPending}
                      onClick={() => fillInput(chip.text)}
                      className="sk flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium text-ink-soft"
                    >
                      {chip.label}
                    </button>
                  ))
                : QUICK_PROMPTS.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      onClick={() => fillInput(q.text)}
                      className="sk flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium text-ink-soft"
                    >
                      {q.icon ? (
                        <Icon
                          name={q.icon}
                          className="h-3.5 w-3.5 text-mint-mid"
                        />
                      ) : (
                        <span className="text-[13px] font-semibold text-mint-mid">
                          ₩
                        </span>
                      )}
                      {q.label}
                    </button>
                  ))}
            </div>
          </div>

          {!inConversation && (
            <>
              {/* 장소·문화행사 검색은 "가끔 쓰는" 기능인데 늘 펼쳐져 있어서 홈이 길고
            꽉 차 보였다. 구분선 가운데 문구를 그대로 버튼으로 바꿔서 기본은 접어두고,
            필요할 때만 펼친다(자리·문구·순서는 그대로). */}
              <div className="mt-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-hairline" />
                <button
                  type="button"
                  onClick={() => setExtrasOpen((v) => !v)}
                  aria-expanded={extrasOpen}
                  aria-controls="home-extras"
                  className={`sk flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 text-[12px] ${
                    extrasOpen ? "sk-on" : "font-medium text-muted"
                  }`}
                >
                  이렇게도 찾아보세요
                  <Icon
                    name="down"
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${extrasOpen ? "-rotate-180" : ""}`}
                  />
                </button>
                <span className="h-px flex-1 bg-hairline" />
              </div>

              {extrasOpen && (
                <div
                  id="home-extras"
                  ref={extrasRef}
                  className="sk-stagger flex flex-col gap-4"
                >
                  <div className="sk-panel sk-enter flex flex-col gap-2.5 p-4">
                    <div className="flex items-center gap-3">
                      <span className="sk-slot h-9 w-9">
                        <Icon
                          name="pin"
                          className="h-[18px] w-[18px] text-accent"
                        />
                      </span>
                      <div>
                        <h2 className="text-[15px] font-semibold text-ink">
                          장소 검색
                        </h2>
                        <p className="text-[12px] text-muted">
                          가고 싶은 장소를 바로 찾아보세요.
                        </p>
                      </div>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const q = placeQuery.trim();
                        if (q) placesMutation.mutate(q);
                      }}
                      className="flex gap-2"
                    >
                      <input
                        value={placeQuery}
                        onChange={(e) => setPlaceQuery(e.target.value)}
                        placeholder="장소 이름으로 검색 (예: 대구미술관)"
                        className="sk-input min-w-0 flex-1 px-3.5 py-2.5 text-[14px] text-ink outline-none placeholder:text-muted/60"
                      />
                      <button
                        type="submit"
                        disabled={
                          placesMutation.isPending || !placeQuery.trim()
                        }
                        className={`sk sk-primary shrink-0 whitespace-nowrap px-4 py-2.5 text-[14px] ${placesMutation.isPending ? "sk-loading" : ""}`}
                      >
                        검색
                      </button>
                    </form>
                    {placesMutation.isPending && (
                      <p className="px-1 text-xs text-muted">검색 중...</p>
                    )}
                    {placesMutation.data && (
                      <div className="sk-stagger flex flex-col gap-2">
                        {placesMutation.data.length === 0 && (
                          <p className="px-1 text-xs text-muted">
                            검색 결과가 없습니다.
                          </p>
                        )}
                        {placesMutation.data.map((p) => (
                          <Link
                            key={p.id}
                            href={`/place/${p.id}`}
                            className="sk-panel block px-4 py-3 text-left"
                          >
                            <div className="text-[15px] font-semibold text-ink">
                              {p.name}
                            </div>
                            {p.roadAddress && (
                              <div className="text-[13px] text-muted">
                                {p.roadAddress}
                              </div>
                            )}
                            {p.categorySummary && (
                              <div className="mt-0.5 text-[12px] text-muted/80">
                                {p.categorySummary}
                              </div>
                            )}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="sk-panel sk-enter flex flex-col gap-2.5 p-4">
                    <div className="flex items-center gap-3">
                      <span className="sk-slot h-9 w-9">
                        <Icon
                          name="calendar"
                          className="h-[18px] w-[18px] text-accent"
                        />
                      </span>
                      <div>
                        <h2 className="text-[15px] font-semibold text-ink">
                          문화행사 검색
                        </h2>
                        <p className="text-[12px] text-muted">
                          전국의 전시, 공연, 축제 정보를 찾아보세요.
                        </p>
                      </div>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        cultureMutation.mutate({
                          dtype: cultureDtype,
                          keyword: cultureKeyword.trim(),
                        });
                      }}
                      className="flex gap-2"
                    >
                      <select
                        value={cultureDtype}
                        onChange={(e) =>
                          setCultureDtype(
                            e.target.value as (typeof CULTURE_DTYPES)[number],
                          )
                        }
                        className="sk-input shrink-0 px-3 py-2.5 text-[14px] font-medium text-ink-soft outline-none"
                      >
                        {CULTURE_DTYPES.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                      <input
                        value={cultureKeyword}
                        onChange={(e) => setCultureKeyword(e.target.value)}
                        placeholder="제목 검색어 (선택)"
                        className="sk-input min-w-0 flex-1 px-3.5 py-2.5 text-[14px] text-ink outline-none placeholder:text-muted/60"
                      />
                      <button
                        type="submit"
                        disabled={cultureMutation.isPending}
                        className={`sk sk-primary shrink-0 whitespace-nowrap px-4 py-2.5 text-[14px] ${cultureMutation.isPending ? "sk-loading" : ""}`}
                      >
                        검색
                      </button>
                    </form>
                    {cultureMutation.isPending && (
                      <p className="px-1 text-xs text-muted">검색 중...</p>
                    )}
                    {cultureMutation.data && (
                      <div className="sk-stagger flex flex-col gap-2">
                        {cultureMutation.data.length === 0 && (
                          <p className="px-1 text-xs text-muted">
                            검색 결과가 없습니다.
                          </p>
                        )}
                        {cultureMutation.data.map((event, i) =>
                          event.url ? (
                            <a
                              key={i}
                              href={event.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="sk-panel flex items-center gap-2 px-4 py-3"
                            >
                              <div className="flex-1">
                                <div className="text-[15px] font-semibold text-ink">
                                  {event.title}
                                </div>
                                <div className="text-[13px] text-muted">
                                  {event.eventSite} · {event.eventPeriod}
                                </div>
                              </div>
                              <Icon
                                name="next"
                                className="h-5 w-5 shrink-0 text-slate-300"
                              />
                            </a>
                          ) : (
                            <div key={i} className="sk-panel px-4 py-3">
                              <div className="text-[15px] font-semibold text-ink">
                                {event.title}
                              </div>
                              <div className="text-[13px] text-muted">
                                {event.eventSite} · {event.eventPeriod}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
