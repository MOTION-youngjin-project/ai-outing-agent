"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import { fetchWeather, fetchAirQuality, fetchPlacesSearch, fetchCulturalEvents, type RecommendResult } from "@/lib/clientApi";
import type { RecommendationFlow } from "@/hooks/useRecommendationFlow";
import { Icon } from "@/components/Icon";
import { SidebarToggleButton } from "@/components/SidebarToggleButton";
import { CourseCard } from "@/components/CourseCard";
import { HourlyWeatherPopover } from "@/components/HourlyWeatherPopover";
import { shortRegionName } from "@/lib/services/matching";

// 결과 화면에서도 쓰는 것과 같은 문구 — 결과 화면은 홈으로 이동해 채우지만, 여긴 이미
// 홈(채팅)이라 입력창에 바로 채우기만 하면 된다.
const QUICK_REFINEMENTS = ["주차 포함", "더 저렴하게", "실내 위주로"] as const;

// 클릭하면 입력창에 문구만 채워넣는 보조 칩(제출은 안 함) — 별도 필터 상태를 만들지 않는다.
const QUICK_PROMPTS = [
  { label: "데이트", icon: "heart", text: "여자친구랑 데이트할만한 곳 있어?" },
  { label: "아이와 함께", icon: "users", text: "아이와 함께 갈 만한 곳 있어?" },
  { label: "혼자", icon: "user", text: "혼자 조용히 갈 만한 곳 있어?" },
  { label: "저비용", icon: null, text: "돈 안 쓰고 반나절 나갔다 올 데 있어?" },
] as const;

// src/lib/tools/culturePortal.ts의 DTYPES와 같은 값 — 서버 전용 도구 모듈을 클라이언트
// 번들에 끌어오지 않으려고 여기 따로 둠(같은 파일이 @langchain/core/tools도 import함).
const CULTURE_DTYPES = ["연극", "뮤지컬", "오페라", "음악", "콘서트", "국악", "무용", "전시", "기타"] as const;

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
    displayedSuggestion,
    showSuggestionChip,
    progressLabel,
    isPending,
    sendMessage,
    acceptSuggestion,
  } = flow;

  // 결과가 도착하면(needsMoreInfo든 코스든) 홈 화면 대신 채팅 스레드 형태로 전환한다
  // (디자인/채팅.png). "새 질문"을 눌러야 다시 홈 화면으로 돌아간다.
  const inConversation = !!recommendation;
  // 대화 전체를 턴 단위로 다시 그린다 — recommendations는 history의 사용자 턴과 같은
  // 순서로 쌓여있어서 인덱스로 짝지을 수 있다(아직 응답 안 온 마지막 턴은 recommendations
  // 쪽이 하나 짧아서 자연히 AI 블록 없이 사용자 말풍선만 뜬다).
  const userTurns = history.filter((t) => t.role === "user");
  const regionName = regions.find((r) => r.id === regionId)?.name;

  // 새 턴이 붙었을 때만 맨 아래(= 답변 끝 + 입력창)로 따라 내려간다.
  // 턴 수가 그대로면 아무것도 하지 않으므로, 사용자가 위로 올려 기록을 읽는 중에
  // 화면이 멋대로 튀지 않는다. 레이아웃이 반영된 다음 프레임에 재야 높이가 맞다.
  const turnCount = history.length;
  useEffect(() => {
    if (turnCount === 0) return;
    const id = requestAnimationFrame(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [turnCount]);

  function startNewQuestion() {
    setHistory([]);
    setInput("");
    setLastRecommendation(null);
    setRecommendations([]);
    setConversationId(null);
  }

  function openCourseDetail(rec: RecommendResult) {
    queryClient.setQueryData(["recommend", rec.agentRunId], rec);
    router.push(`/recommend/${rec.agentRunId}`);
  }

  // 지역을 아직 안 골랐어도 상단 배지엔 대구 날씨를 기본으로 보여준다(디자인/홈 화면 —
  // 지역 미선택 상태에서도 "대구 31°C" 배지가 항상 떠 있음).
  const defaultRegionId = regions.find((r) => r.name === "대구광역시")?.id;
  const badgeRegionId = regionId || defaultRegionId || "";
  const weatherQuery = useQuery({
    queryKey: ["weather", badgeRegionId],
    queryFn: () => fetchWeather(badgeRegionId),
    enabled: !!badgeRegionId,
  });
  const airQualityQuery = useQuery({
    queryKey: ["air-quality", regionId],
    queryFn: () => fetchAirQuality(regionId),
    enabled: !!regionId,
  });

  // 검색창 입력값은 제출 전까지 이 화면 밖에서 쓸 일이 없는 순수 로컬 상태라 스토어로 안 옮김.
  const [placeQuery, setPlaceQuery] = useState("");
  const placesMutation = useMutation({ mutationFn: fetchPlacesSearch });

  const [cultureDtype, setCultureDtype] = useState<(typeof CULTURE_DTYPES)[number]>(CULTURE_DTYPES[0]);
  const [cultureKeyword, setCultureKeyword] = useState("");
  const cultureMutation = useMutation({ mutationFn: fetchCulturalEvents });

  return (
    <>
      <div className="flex items-center justify-between px-5 pb-1 pt-5">
        <SidebarToggleButton filled={inConversation} />
        {inConversation ? (
          <div className="flex items-center gap-2">
            <button
              onClick={startNewQuestion}
              aria-label="새 질문"
              className="sk sk-primary sk-slot h-9 w-9"
            >
              <Icon name="plus" className="h-4 w-4" />
            </button>
            <button
              onClick={startNewQuestion}
              aria-label="대화 나가기"
              className="sk sk-primary sk-slot h-9 w-9"
            >
              <Icon name="exit" className="h-4 w-4" />
            </button>
          </div>
        ) : (
          weatherQuery.data && (
            <HourlyWeatherPopover regionName={shortRegionName(regions.find((r) => r.id === badgeRegionId)?.name ?? "")} weather={weatherQuery.data} />
          )
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 px-5">
        {!inConversation && (
          <>
            <div className="sk-enter pb-1 pt-3 text-center">
              <h1 className="text-[26px] font-bold leading-tight text-accent">어디로 나가볼까요?</h1>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                지역을 고르고 하고 싶은 걸 편하게 적어주세요.
                <br />
                날씨와 대기질을 함께 확인해서 코스를 추천해드려요.
              </p>
            </div>

            <div className="sk-input sk-enter flex items-center gap-2 px-4 py-3">
              <Icon name="pin" className="h-[18px] w-[18px] text-accent" />
              <select
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
                disabled={isPending}
                className="-my-2 flex-1 bg-transparent py-2 text-[15px] font-medium text-ink outline-none disabled:opacity-50"
              >
                <option value="">지역을 선택하세요</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            {!!regionId && (weatherQuery.data || airQualityQuery.data) && (
              <div className="sk-panel sk-enter flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-[13px]">
                {airQualityQuery.data && (
                  <span className="flex items-center gap-1.5">
                    <span className="sk-slot h-7 w-7"><Icon name="dust" className="h-[16px] w-[16px]" /></span>
                    <span className="text-muted">미세먼지</span>
                    <span className="font-semibold text-accent">{airQualityQuery.data.overallGrade}</span>
                  </span>
                )}
                {weatherQuery.data && (
                  <span className="flex items-center gap-1.5">
                    <Icon name="sun" className="h-[18px] w-[18px] text-amber-400" />
                    <span className="font-medium text-ink-soft">
                      {weatherQuery.data.temperatureC !== null ? `${weatherQuery.data.temperatureC}°C · ` : ""}
                      {weatherQuery.data.summary}
                    </span>
                  </span>
                )}
              </div>
            )}
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
              const turnHasCourse = !!rec && !rec.needsMoreInfo && (rec.places?.length ?? 0) > 0;
              return (
                <div key={i} className="flex flex-col gap-3">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-[16px_4px_3px_16px] bg-mint-bg px-4 py-2.5 text-[14px] leading-relaxed text-ink">
                      {turn.content}
                    </div>
                  </div>
                  {rec && (
                    <div className="flex items-start gap-2">
                      <span className="sk-slot mt-0.5 h-7 w-7">
                        <Icon name="sparkle" className="h-4 w-4 text-mint-mid" />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <span className="text-[12px] font-semibold text-muted">AI 추천</span>
                        {rec.needsMoreInfo && (
                          <div className="sk-panel border-accent/30 bg-mint-bg px-4 py-3.5">
                            <p className="text-[14px] leading-relaxed text-ink">{rec.message}</p>
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
                              airQuality={isLast ? airQualityQuery.data : undefined}
                              onOpenDetail={() => openCourseDetail(rec)}
                            />
                            {rec.message && (
                              <div className="sk-panel px-4 py-3.5 text-[13px] leading-relaxed text-ink-soft">
                                {rec.message}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {errorMessage && (
          <div className="sk-panel border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {/* 조회 중 — 패널 위를 느린 스캔 밴드가 왕복한다(가짜 진행률은 만들지 않는다).
            progressLabel은 실제 도구 호출 이벤트에서 나오는 값이고, 그 문구가 바뀔 때만
            key가 바뀌어 위로 밀려 올라오며 교체된다 = "다음 단계로 넘어갔다". */}
        {isPending && (
          <div className="sk-panel sk-scan sk-enter flex items-center gap-2.5 px-4 py-3.5" role="status">
            <span className="sk-dot" />
            <p key={progressLabel} className="sk-swap text-[14px] text-muted">
              {progressLabel}
            </p>
          </div>
        )}

        {/* 입력창 — 대화 중에는 화면 하단에 붙어 있어야 한다(스크롤로 사라지면
            위로 기록을 읽다가 질문을 못 한다). position:sticky라 자리를 그대로
            차지하므로 별도 여백 계산이 필요 없고, 맨 아래까지 내리면 제자리에 앉는다.
            bottom은 탭바 높이(--sk-dock)에서 10px 빼서 아래끝이 탭바에 살짝 물리게
            한다 — 그래야 둘 사이 틈으로 본문이 비쳐 보이지 않는다.
            탭바가 없는 lg에서는 0이다. */}
        <div
          className={
            inConversation
              ? "sticky bottom-[calc(var(--sk-dock)-10px+env(safe-area-inset-bottom))] z-10 -mx-5 mt-1 flex flex-col gap-2 border-t border-[var(--sk-line-soft)] bg-page/95 px-5 pb-3 pt-2.5 backdrop-blur lg:bottom-0"
              : "flex flex-col gap-2 pt-2"
          }
        >
          {showSuggestionChip && !input && (
            <button
              type="button"
              onClick={acceptSuggestion}
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
              {!input && (
                <div className="pointer-events-none absolute inset-0 flex items-center truncate text-[15px] text-muted/70">
                  {displayedSuggestion}
                </div>
              )}
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (!input && (e.key === "ArrowRight" || e.key === "Tab")) {
                    e.preventDefault();
                    acceptSuggestion();
                  }
                }}
                disabled={isPending}
                className="relative w-full bg-transparent py-2 text-[15px] text-ink outline-none disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={isPending || !regionId}
              aria-label="보내기"
              className={`sk sk-primary sk-slot h-10 w-10 ${isPending ? "sk-loading" : ""}`}
            >
              <Icon name="send" className="h-[18px] w-[18px]" />
            </button>
          </form>

          {/* 지역을 안 고르면 보내기 버튼이 비활성이라 클릭도 Enter도 아무 일이 안 일어난다
              (비활성 submit 버튼은 Enter 암묵 제출까지 막는다) — 이유를 안 알려주면 앱이
              먹통인 걸로 보인다. 지역을 고르면 저절로 사라지는 파생 렌더링. */}
          {!regionId && input.trim() && (
            <p className="px-4 text-[13px] text-red-600">위에서 지역을 먼저 선택해주세요.</p>
          )}

          <div
            className={`sk-stagger flex gap-2 overflow-x-auto ${
              inConversation ? `pb-1.5 pt-1 ${input ? "hidden" : ""}` : "pb-2.5 pt-1"
            }`}
          >
            {inConversation
              ? QUICK_REFINEMENTS.map((text) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => setInput(text)}
                    className="sk flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium text-ink-soft"
                  >
                    {text}
                  </button>
                ))
              : QUICK_PROMPTS.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => setInput(q.text)}
                    className="sk flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium text-ink-soft"
                  >
                    {q.icon ? (
                      <Icon name={q.icon} className="h-3.5 w-3.5 text-mint-mid" />
                    ) : (
                      <span className="text-[13px] font-semibold text-mint-mid">₩</span>
                    )}
                    {q.label}
                  </button>
                ))}
          </div>
        </div>

        {!inConversation && (
        <>
        <div className="mt-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-hairline" />
          <span className="shrink-0 text-[12px] text-muted">이렇게도 찾아보세요</span>
          <span className="h-px flex-1 bg-hairline" />
        </div>

        <div className="sk-panel sk-enter flex flex-col gap-2.5 p-4">
          <div className="flex items-center gap-3">
            <span className="sk-slot h-9 w-9">
              <Icon name="pin" className="h-[18px] w-[18px] text-accent" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-ink">장소 검색</h2>
              <p className="text-[12px] text-muted">가고 싶은 장소를 바로 찾아보세요.</p>
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
              disabled={placesMutation.isPending || !placeQuery.trim()}
              className={`sk sk-primary shrink-0 whitespace-nowrap px-4 py-2.5 text-[14px] ${placesMutation.isPending ? "sk-loading" : ""}`}
            >
              검색
            </button>
          </form>
          {placesMutation.isPending && <p className="px-1 text-xs text-muted">검색 중...</p>}
          {placesMutation.data && (
            <div className="sk-stagger flex flex-col gap-2">
              {placesMutation.data.length === 0 && (
                <p className="px-1 text-xs text-muted">검색 결과가 없습니다.</p>
              )}
              {placesMutation.data.map((p) => (
                <Link
                  key={p.id}
                  href={`/place/${p.id}`}
                  className="sk-panel block px-4 py-3 text-left"
                >
                  <div className="text-[15px] font-semibold text-ink">{p.name}</div>
                  {p.roadAddress && <div className="text-[13px] text-muted">{p.roadAddress}</div>}
                  {p.categorySummary && (
                    <div className="mt-0.5 text-[12px] text-muted/80">{p.categorySummary}</div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="sk-panel sk-enter mt-4 flex flex-col gap-2.5 p-4">
          <div className="flex items-center gap-3">
            <span className="sk-slot h-9 w-9">
              <Icon name="calendar" className="h-[18px] w-[18px] text-accent" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-ink">문화행사 검색</h2>
              <p className="text-[12px] text-muted">전국의 전시, 공연, 축제 정보를 찾아보세요.</p>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              cultureMutation.mutate({ dtype: cultureDtype, keyword: cultureKeyword.trim() });
            }}
            className="flex gap-2"
          >
            <select
              value={cultureDtype}
              onChange={(e) => setCultureDtype(e.target.value as (typeof CULTURE_DTYPES)[number])}
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
          {cultureMutation.isPending && <p className="px-1 text-xs text-muted">검색 중...</p>}
          {cultureMutation.data && (
            <div className="sk-stagger flex flex-col gap-2">
              {cultureMutation.data.length === 0 && (
                <p className="px-1 text-xs text-muted">검색 결과가 없습니다.</p>
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
                      <div className="text-[15px] font-semibold text-ink">{event.title}</div>
                      <div className="text-[13px] text-muted">
                        {event.eventSite} · {event.eventPeriod}
                      </div>
                    </div>
                    <Icon name="next" className="h-5 w-5 shrink-0 text-slate-300" />
                  </a>
                ) : (
                  <div key={i} className="sk-panel px-4 py-3">
                    <div className="text-[15px] font-semibold text-ink">{event.title}</div>
                    <div className="text-[13px] text-muted">
                      {event.eventSite} · {event.eventPeriod}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </>
  );
}
