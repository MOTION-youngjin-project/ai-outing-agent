"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import { fetchWeather, fetchAirQuality, fetchPlacesSearch, fetchCulturalEvents } from "@/lib/clientApi";
import type { RecommendationFlow } from "@/hooks/useRecommendationFlow";
import { Icon } from "@/components/Icon";
import { SidebarToggleButton } from "@/components/SidebarToggleButton";
import { CourseCard } from "@/components/CourseCard";

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
  const { input, setInput, regionId, setRegionId, history, setHistory, setLastRecommendation } = useAppStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    regions,
    recommendation,
    promptMessage,
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
  const hasCourse = !!recommendation && !recommendation.needsMoreInfo && (recommendation.places?.length ?? 0) > 0;
  const lastUserMessage = [...history].reverse().find((t) => t.role === "user")?.content ?? null;
  const regionName = regions.find((r) => r.id === regionId)?.name;

  function startNewQuestion() {
    setHistory([]);
    setInput("");
    setLastRecommendation(null);
  }

  function openCourseDetail() {
    if (!recommendation) return;
    queryClient.setQueryData(["recommend", recommendation.agentRunId], recommendation);
    router.push(`/recommend/${recommendation.agentRunId}`);
  }

  const weatherQuery = useQuery({
    queryKey: ["weather", regionId],
    queryFn: () => fetchWeather(regionId),
    enabled: !!regionId,
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
        <SidebarToggleButton />
        {inConversation ? (
          <button
            onClick={startNewQuestion}
            aria-label="새 질문"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink-soft shadow-[0_1px_3px_rgba(17,24,39,0.05)]"
          >
            <Icon name="plus" className="h-4 w-4" />
          </button>
        ) : (
          weatherQuery.data && (
            <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-medium text-ink-soft shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
              <Icon name="sun" className="h-4 w-4 text-amber-400" />
              {weatherQuery.data.temperatureC !== null
                ? `${weatherQuery.data.temperatureC}°C`
                : weatherQuery.data.summary}
            </span>
          )
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 px-5">
        {!inConversation && (
          <>
            <div className="pb-1 pt-3">
              <h1 className="text-[26px] font-bold leading-tight text-accent">어디로 나가볼까요?</h1>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                지역을 고르고 하고 싶은 걸 편하게 적어주세요.
                <br />
                날씨와 대기질을 함께 확인해서 코스를 추천해드려요.
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
              <Icon name="pin" className="h-[18px] w-[18px] text-accent" />
              <select
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
                disabled={isPending}
                className="flex-1 bg-transparent text-[15px] font-medium text-ink outline-none disabled:opacity-50"
              >
                <option value="">지역을 선택하세요</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            {(weatherQuery.data || airQualityQuery.data) && (
              <div className="flex items-center gap-4 rounded-2xl bg-white px-4 py-3 text-[13px] shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
                {airQualityQuery.data && (
                  <span className="flex items-center gap-1.5">
                    <Icon name="dust" className="h-[18px] w-[18px] text-mint-mid" />
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

        {inConversation && (
          <div className="flex flex-col gap-3 pt-2">
            {lastUserMessage && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-accent px-4 py-2.5 text-[14px] leading-relaxed text-white">
                  {lastUserMessage}
                </div>
              </div>
            )}
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mint-soft">
                <Icon name="sparkle" className="h-4 w-4 text-mint-mid" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="text-[12px] font-semibold text-muted">AI 추천</span>
                {promptMessage && (
                  <div className="rounded-2xl border border-accent/30 bg-mint-bg px-4 py-3.5">
                    <p className="text-[14px] leading-relaxed text-ink">{promptMessage}</p>
                  </div>
                )}
                {hasCourse && recommendation && (
                  <>
                    <CourseCard
                      recommendation={recommendation}
                      regionName={regionName}
                      weather={weatherQuery.data}
                      airQuality={airQualityQuery.data}
                      onOpenDetail={openCourseDetail}
                    />
                    {recommendation.message && (
                      <div className="rounded-2xl bg-white px-4 py-3.5 text-[13px] leading-relaxed text-ink-soft shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
                        {recommendation.message}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {isPending && (
          <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3.5 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            <p className="text-[14px] text-muted">{progressLabel}</p>
          </div>
        )}

        <div className="flex flex-col gap-2 pt-2">
          {showSuggestionChip && !input && (
            <button
              type="button"
              onClick={acceptSuggestion}
              className="flex items-center gap-1.5 self-start rounded-full border border-accent/40 bg-mint-bg px-3.5 py-1.5 text-[13px] font-medium text-accent"
            >
              <Icon name="sparkle" className="h-3.5 w-3.5" />
              {displayedSuggestion}
            </button>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex items-center gap-2 rounded-full bg-white p-1.5 pl-4 shadow-[0_1px_4px_rgba(17,24,39,0.07)]"
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
              className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white transition-colors disabled:bg-slate-200 disabled:text-slate-400"
            >
              <Icon name="send" className="h-[18px] w-[18px]" />
            </button>
          </form>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {inConversation
              ? QUICK_REFINEMENTS.map((text) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => setInput(text)}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-white px-3.5 py-1.5 text-[13px] text-ink-soft"
                  >
                    {text}
                  </button>
                ))
              : QUICK_PROMPTS.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => setInput(q.text)}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-white px-3.5 py-1.5 text-[13px] text-ink-soft"
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

        <div className="flex flex-col gap-2.5">
          <h2 className="px-1 text-[13px] font-semibold text-muted">장소 검색</h2>
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
              className="flex-1 rounded-full bg-white px-4 py-2.5 text-[14px] text-ink shadow-[0_1px_3px_rgba(17,24,39,0.05)] outline-none placeholder:text-muted/60"
            />
            <button
              type="submit"
              disabled={placesMutation.isPending || !placeQuery.trim()}
              className="rounded-full bg-white px-4 py-2.5 text-[14px] font-medium text-ink-soft shadow-[0_1px_3px_rgba(17,24,39,0.05)] disabled:text-muted/50"
            >
              검색
            </button>
          </form>
          {placesMutation.isPending && <p className="px-1 text-xs text-muted">검색 중...</p>}
          {placesMutation.data && (
            <div className="flex flex-col gap-2">
              {placesMutation.data.length === 0 && (
                <p className="px-1 text-xs text-muted">검색 결과가 없습니다.</p>
              )}
              {placesMutation.data.map((p) => (
                <Link
                  key={p.id}
                  href={`/place/${p.id}`}
                  className="block rounded-2xl bg-white px-4 py-3 text-left shadow-[0_1px_3px_rgba(17,24,39,0.05)]"
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

        <div className="mt-6 flex flex-col gap-2.5">
          <h2 className="px-1 text-[13px] font-semibold text-muted">
            문화행사 검색 <span className="font-normal">(전국 결과, 지역 필터 없음)</span>
          </h2>
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
              className="rounded-full bg-white px-3.5 py-2.5 text-[14px] font-medium text-ink-soft shadow-[0_1px_3px_rgba(17,24,39,0.05)] outline-none"
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
              className="flex-1 rounded-full bg-white px-4 py-2.5 text-[14px] text-ink shadow-[0_1px_3px_rgba(17,24,39,0.05)] outline-none placeholder:text-muted/60"
            />
            <button
              type="submit"
              disabled={cultureMutation.isPending}
              className="rounded-full bg-white px-4 py-2.5 text-[14px] font-medium text-ink-soft shadow-[0_1px_3px_rgba(17,24,39,0.05)] disabled:text-muted/50"
            >
              검색
            </button>
          </form>
          {cultureMutation.isPending && <p className="px-1 text-xs text-muted">검색 중...</p>}
          {cultureMutation.data && (
            <div className="flex flex-col gap-2">
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
                    className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-[0_1px_3px_rgba(17,24,39,0.05)]"
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
                  <div key={i} className="rounded-2xl bg-white px-4 py-3 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
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
