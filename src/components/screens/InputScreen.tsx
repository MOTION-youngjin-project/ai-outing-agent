"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import { fetchWeather, fetchAirQuality, fetchPlacesSearch, fetchCulturalEvents } from "@/lib/clientApi";
import type { RecommendationFlow } from "@/hooks/useRecommendationFlow";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";

// src/lib/tools/culturePortal.ts의 DTYPES와 같은 값 — 서버 전용 도구 모듈을 클라이언트
// 번들에 끌어오지 않으려고 여기 따로 둠(같은 파일이 @langchain/core/tools도 import함).
const CULTURE_DTYPES = ["연극", "뮤지컬", "오페라", "음악", "콘서트", "국악", "무용", "전시", "기타"] as const;

export function InputScreen({ flow }: { flow: RecommendationFlow }) {
  const { view, input, setInput, regionId, setRegionId } = useAppStore();
  const {
    regions,
    promptMessage,
    errorMessage,
    displayedSuggestion,
    showSuggestionChip,
    progressLabel,
    sendMessage,
    acceptSuggestion,
  } = flow;

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
      <ScreenHeader title="어디로 나가볼까요?" />
      <div className="flex flex-1 flex-col gap-3 px-5">
        <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
          <Icon name="pin" className="h-[18px] w-[18px] text-accent" />
          <select
            value={regionId}
            onChange={(e) => setRegionId(e.target.value)}
            disabled={view === "loading"}
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

        {promptMessage && (
          <div className="rounded-2xl border border-accent/30 bg-mint-bg px-4 py-3.5">
            <div className="flex gap-2">
              <Icon name="sparkle" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-accent" />
              <p className="text-[15px] font-semibold leading-relaxed text-ink">{promptMessage}</p>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {view === "loading" && (
          <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3.5 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            <p className="text-[14px] text-muted">{progressLabel}</p>
          </div>
        )}

        {view === "input" && !promptMessage && !errorMessage && (
          <p className="px-1 pt-1 text-[13px] leading-relaxed text-muted">
            지역을 고르고 하고 싶은 걸 편하게 적어주세요.
            <br />
            날씨와 대기질을 함께 확인해서 코스를 추천해드려요.
          </p>
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
                disabled={view === "loading"}
                className="relative w-full bg-transparent py-2 text-[15px] text-ink outline-none disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={view === "loading" || !regionId}
              aria-label="보내기"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white transition-colors disabled:bg-slate-200 disabled:text-slate-400"
            >
              <Icon name="send" className="h-[18px] w-[18px]" />
            </button>
          </form>
        </div>

        <div className="mt-8 flex flex-col gap-2.5">
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
                <div
                  key={p.id}
                  className="rounded-2xl bg-white px-4 py-3 shadow-[0_1px_3px_rgba(17,24,39,0.05)]"
                >
                  <div className="text-[15px] font-semibold text-ink">{p.name}</div>
                  {p.roadAddress && <div className="text-[13px] text-muted">{p.roadAddress}</div>}
                  {p.categorySummary && (
                    <div className="mt-0.5 text-[12px] text-muted/80">{p.categorySummary}</div>
                  )}
                </div>
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
              {cultureMutation.data.map((event, i) => (
                <div key={i} className="rounded-2xl bg-white px-4 py-3 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
                  <div className="text-[15px] font-semibold text-ink">{event.title}</div>
                  <div className="text-[13px] text-muted">
                    {event.eventSite} · {event.eventPeriod}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
