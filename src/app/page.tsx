"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ChatTurn, Recommendation } from "@/lib/agent";
import type { ParkingSpot } from "@/lib/tools/parking";
import { useAppStore, type Place } from "@/lib/store";
import { KakaoMap } from "@/components/KakaoMap";

type Region = { id: string; parentId: string | null; name: string; level: string };
type ParkingSpotWithDistance = ParkingSpot & { distanceMeters: number | null; walkMinutes: number | null };
type ParkingResult = { spots: ParkingSpotWithDistance[]; destination: { latitude: number; longitude: number } | null };
type WeatherInfo = { temperatureC: number | null; precipitationProbability: number | null; summary: string };
type AirQualityInfo = { pm10Value: number | null; overallGrade: string };
type PlaceResult = {
  id: string;
  name: string;
  roadAddress: string | null;
  categorySummary: string | null;
  phone: string | null;
};
type CulturalEvent = { title: string; eventPeriod: string; eventSite: string; url: string; imageUrl: string };

// src/lib/tools/culturePortal.ts의 DTYPES와 같은 값 — 서버 전용 도구 모듈을 클라이언트
// 번들에 끌어오지 않으려고 여기 따로 둠(같은 파일이 @langchain/core/tools도 import함).
const CULTURE_DTYPES = ["연극", "뮤지컬", "오페라", "음악", "콘서트", "국악", "무용", "전시", "기타"] as const;

// 목업의 아웃라인 아이콘을 인라인 SVG로 옮긴 것. 아이콘 라이브러리를 새로 넣지 않으려고
// 필요한 것만 직접 그림(유니코드 문자로 때우면 아이콘처럼 안 보여서 교체).
function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    back: <path d="M15 5l-7 7 7 7" />,
    next: <path d="M9 5l7 7-7 7" />,
    gear: (
      <>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5v.2a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1h.2a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" />
      </>
    ),
    heart: <path d="M20.8 8.6c0 5-8.8 10-8.8 10s-8.8-5-8.8-10a5 5 0 018.8-3.2A5 5 0 0120.8 8.6z" />,
    sparkle: <path d="M12 3l2.1 5.4L19.5 10l-5.4 1.6L12 17l-2.1-5.4L4.5 10l5.4-1.6L12 3z" />,
    pin: (
      <>
        <path d="M20 10c0 5.5-8 12-8 12s-8-6.5-8-12a8 8 0 1116 0z" />
        <circle cx="12" cy="10" r="2.6" />
      </>
    ),
    dust: (
      <>
        <circle cx="12" cy="12" r="8.4" />
        <path d="M4.6 14.4c2.6.9 4.6-1.2 7.4-1.2s5 1.6 7.4.6" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.6v2M12 19.4v2M4.5 4.5l1.4 1.4M18.1 18.1l1.4 1.4M2.6 12h2M19.4 12h2M4.5 19.5l1.4-1.4M18.1 5.9l1.4-1.4" />
      </>
    ),
    home: <path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1v-9.5z" />,
    compass: (
      <>
        <circle cx="12" cy="12" r="8.6" />
        <circle cx="12" cy="12" r="2.6" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8.4" r="3.6" />
        <path d="M4.8 20a7.4 7.4 0 0114.4 0" />
      </>
    ),
    parking: (
      <>
        <circle cx="12" cy="12" r="8.6" />
        <path d="M10 17V7.8h2.9a2.9 2.9 0 010 5.8H10" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="8.6" />
        <path d="M12 7.2V12l3 1.8" />
      </>
    ),
    bookmark: <path d="M6.5 4h11a1 1 0 011 1v15l-6.5-4-6.5 4V5a1 1 0 011-1z" />,
    card: (
      <>
        <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
        <path d="M2.5 9.5h19" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="8.6" />
        <path d="M12 11v5.5M12 8v.1" />
      </>
    ),
    send: <path d="M4.5 12l15-7.5-4 15-3.6-5.6L4.5 12z" />,
    drop: <path d="M12 3.5c3 4 6 7.4 6 11a6 6 0 01-12 0c0-3.6 3-7 6-11z" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}

function ScreenHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-5 pb-3 pt-5">
      {onBack && (
        <button onClick={onBack} aria-label="뒤로가기" className="-ml-1 p-1 text-ink">
          <Icon name="back" className="h-6 w-6" />
        </button>
      )}
      <h1 className="flex-1 text-[22px] font-bold tracking-tight text-ink">{title}</h1>
      {right}
    </div>
  );
}

// ponytail: 로그인/저장 기능이 아직 없어서(팀 플로우차트상 "선택" 항목, 이번 스코프 밖)
// 마이페이지 디자인을 화면에 반영하기 위한 더미 데이터. 실제 로그인·저장 붙이면 교체.
const MYPAGE_STATS = { savedPlaces: 12, recentRecommendations: 8, savedParking: 3 };
const MYPAGE_SAVED_PLACES = [
  { name: "수성못", category: "야경 명소 · 수성구" },
  { name: "대구미술관", category: "미술관 · 수성구" },
  { name: "앞산 카페거리", category: "카페 · 남구" },
];
const MYPAGE_PREFERENCES = [
  { icon: "heart", label: "데이트" },
  { icon: "home", label: "실내 우선" },
  { icon: "won", label: "저비용" },
  { icon: "drop", label: "조용한 곳" },
];
const MYPAGE_RECENT_QUESTIONS = [
  { question: "여자친구랑 분위기 좋은 곳 추천해줘", date: "2026.09.03 오후 7:30" },
  { question: "주차 편한 실내 데이트 코스", date: "2026.09.01 오후 3:45" },
];
const MYPAGE_SETTINGS_MENU = ["알림 설정", "방문 예정", "앱 설정", "로그아웃"];

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

async function fetchRegions(): Promise<Region[]> {
  const res = await fetch("/api/regions?level=sido");
  const data = await res.json();
  return data.data ?? [];
}

async function fetchWeather(regionId: string): Promise<WeatherInfo | null> {
  const res = await fetch(`/api/weather?regionId=${regionId}`);
  const data = await res.json();
  return data.data ?? null;
}

async function fetchAirQuality(regionId: string): Promise<AirQualityInfo | null> {
  const res = await fetch(`/api/air-quality?regionId=${regionId}`);
  const data = await res.json();
  return data.data ?? null;
}

export type RecommendProgressEvent = { type: string; tool?: string };

// /api/recommend는 NDJSON(줄바꿈 구분 JSON)을 스트리밍한다 — 도구 호출 시작/종료,
// 장소 정리 단계를 onProgress로 실시간 전달하고, "result"/"error" 줄로 끝난다.
async function postRecommend(
  history: ChatTurn[],
  onProgress?: (event: RecommendProgressEvent) => void
): Promise<Recommendation> {
  let res: Response;
  try {
    res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history }),
    });
  } catch {
    throw new Error("요청에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
  if (!res.ok || !res.body) throw new Error("알 수 없는 오류가 발생했습니다.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: Recommendation | null = null;
  let errorMessage: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "result") result = event.result.recommendation as Recommendation;
      else if (event.type === "error") errorMessage = event.message;
      else onProgress?.(event);
    }
  }

  if (errorMessage) throw new Error(errorMessage);
  if (!result) throw new Error("알 수 없는 오류가 발생했습니다.");
  return result;
}

async function postSuggest(history: ChatTurn[]): Promise<string | null> {
  const res = await fetch("/api/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ history }),
  });
  const data = await res.json();
  return data.suggestion ?? null;
}

async function fetchParking(district: string, placeName?: string): Promise<ParkingResult> {
  try {
    const params = new URLSearchParams({ district });
    if (placeName) params.set("placeName", placeName);
    const res = await fetch(`/api/parking?${params}`);
    const data = await res.json();
    return res.ok ? { spots: data.spots, destination: data.destination } : { spots: [], destination: null };
  } catch {
    return { spots: [], destination: null };
  }
}

// 잔여율 기준 혼잡도 라벨. 실시간 정보가 없으면 null(표시 안 함).
function occupancyLabel(spot: {
  remainingSpaces: number | null;
  capacity: number;
}): { label: string; className: string } | null {
  if (spot.remainingSpaces === null || spot.capacity === 0) return null;
  const ratio = spot.remainingSpaces / spot.capacity;
  if (ratio >= 0.3) return { label: "여유", className: "text-emerald-600" };
  if (ratio >= 0.1) return { label: "보통", className: "text-amber-500" };
  return { label: "혼잡", className: "text-rose-500" };
}

async function fetchPlacesSearch(query: string): Promise<PlaceResult[]> {
  const res = await fetch(`/api/places?query=${encodeURIComponent(query)}`);
  const data = await res.json();
  return res.ok ? data.data : [];
}

async function fetchCulturalEvents(params: { dtype: string; keyword: string }): Promise<CulturalEvent[]> {
  const search = new URLSearchParams({ dtype: params.dtype });
  if (params.keyword) search.set("keyword", params.keyword);
  const res = await fetch(`/api/cultural-events?${search}`);
  const data = await res.json();
  return res.ok ? data.data : [];
}

export default function Home() {
  const {
    view,
    input,
    history,
    selectedPlace,
    selectedParkingSpot,
    regionId,
    setView,
    setInput,
    setHistory,
    selectPlace,
    selectParkingSpot,
    setRegionId,
  } = useAppStore();

  // 서버/클라이언트 초기 렌더가 일치해야 하므로 고정값으로 시작하고, 마운트 후에만 랜덤화한다.
  // 순수 장식용 클라이언트 상태라 전역 스토어로 옮기지 않았다.
  const [localSuggestion, setLocalSuggestion] = useState(SUGGESTIONS[0]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 의도적으로 클라이언트에서만 랜덤화 (서버와 값이 달라도 되는 장식용 텍스트)
    setLocalSuggestion(randomSuggestion());
  }, []);

  // 찜 아이콘은 디자인팀 목업의 시각 요소만 반영 — 로그인/저장 흐름은 이번 스코프 밖이라
  // 서버 저장 없이 화면에서만 토글되는 장식용 상태.
  const [favoriteIndexes, setFavoriteIndexes] = useState<Set<number>>(new Set());

  // 검색창 입력값은 제출 전까지 이 화면 밖에서 쓸 일이 없는 순수 로컬 상태라 스토어로 안 옮김.
  const [placeQuery, setPlaceQuery] = useState("");
  const placesMutation = useMutation({ mutationFn: fetchPlacesSearch });

  const [cultureDtype, setCultureDtype] = useState<(typeof CULTURE_DTYPES)[number]>(CULTURE_DTYPES[0]);
  const [cultureKeyword, setCultureKeyword] = useState("");
  const cultureMutation = useMutation({ mutationFn: fetchCulturalEvents });

  const regionsQuery = useQuery({ queryKey: ["regions", "sido"], queryFn: fetchRegions });
  const regions = regionsQuery.data ?? [];

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
    },
    onError: () => setView("input"),
  });

  const parkingQuery = useQuery({
    queryKey: ["parking", selectedPlace?.daeguDistrict, selectedPlace?.name],
    queryFn: () => fetchParking(selectedPlace!.daeguDistrict!, selectedPlace!.name),
    enabled: view === "parking" && !!selectedPlace?.daeguDistrict,
  });

  const recommendation = recommendMutation.data ?? null;
  const promptMessage = recommendation?.needsMoreInfo ? recommendation.message : null;
  const errorMessage = recommendMutation.error instanceof Error ? recommendMutation.error.message : null;
  const displayedSuggestion =
    recommendMutation.isPending || suggestMutation.isPending
      ? ""
      : (suggestMutation.data ?? localSuggestion);
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

  function openDetail(place: Place) {
    selectPlace(place);
    setView("detail");
  }

  function viewParking() {
    if (!selectedPlace?.daeguDistrict) return;
    setView("parking");
  }

  function viewParkingFor(place: Place) {
    if (!place.daeguDistrict) return;
    selectPlace(place);
    setView("parking");
  }

  function openParkingDetail(spot: ParkingSpotWithDistance) {
    selectParkingSpot(spot);
    setView("parking-detail");
  }

  function toggleFavorite(index: number) {
    setFavoriteIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }


  // 목업의 AI 코멘트 카드는 굵은 한 줄 + 설명 본문 구조라, message의 첫 문장을 헤드라인으로 쓴다.
  const aiMessage = recommendation?.message ?? "";
  const aiSplitAt = aiMessage.search(/[.!?]\s/);
  const aiHeadline = aiSplitAt > 0 ? aiMessage.slice(0, aiSplitAt + 1) : aiMessage;
  const aiBody = aiSplitAt > 0 ? aiMessage.slice(aiSplitAt + 1).trim() : "";

  const regionName = regions.find((r) => r.id === regionId)?.name ?? "";
  const showBottomNav = view === "input" || view === "results" || view === "mypage";

  return (
    <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col bg-page">
      <div className="flex flex-1 flex-col pb-6">
        {(view === "input" || view === "loading") && (
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
                {!recommendMutation.isPending && !suggestMutation.isPending && suggestMutation.data && !input && (
                  <button
                    type="button"
                    onClick={acceptSuggestion}
                    className="flex items-center gap-1.5 self-start rounded-full border border-accent/40 bg-mint-bg px-3.5 py-1.5 text-[13px] font-medium text-accent"
                  >
                    <Icon name="sparkle" className="h-3.5 w-3.5" />
                    {suggestMutation.data}
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
        )}

        {view === "results" && recommendation?.places && (
          <>
            <ScreenHeader title="추천 결과" onBack={() => setView("input")} />
            <div className="flex flex-col gap-3 px-5">
              <div className="flex items-center gap-4 rounded-2xl bg-white px-4 py-3.5 text-[13px] shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
                <span className="flex items-center gap-1.5">
                  <Icon name="pin" className="h-[18px] w-[18px] text-muted" />
                  <span className="font-medium text-ink-soft">{regionName || "-"}</span>
                </span>
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

              <div className="rounded-2xl border border-accent/40 bg-mint-bg px-4 py-4">
                <div className="flex gap-2">
                  <Icon name="sparkle" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-accent" />
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[16px] font-bold leading-snug text-ink">{aiHeadline}</p>
                    {aiBody && <p className="text-[13px] leading-relaxed text-muted">{aiBody}</p>}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-accent bg-white px-3.5 py-1.5 text-[13px] font-semibold text-accent">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  전체
                </span>
                {["실내", "야외", "데이트", "저비용"].map((label) => (
                  <span
                    key={label}
                    title="준비 중인 필터입니다"
                    className="shrink-0 cursor-not-allowed rounded-full border border-hairline bg-white px-3.5 py-1.5 text-[13px] text-muted/70"
                  >
                    {label}
                  </span>
                ))}
              </div>

              <div className="flex flex-col gap-3">
                {recommendation.places.map((p, i) => (
                  <div
                    key={i}
                    className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(17,24,39,0.06)]"
                  >
                    <div className="flex gap-3 p-3">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- 외부 공공데이터 이미지, 도메인 사전등록 불필요한 일반 img로 처리
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="h-[104px] w-[104px] shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="flex h-[104px] w-[104px] shrink-0 items-center justify-center rounded-xl bg-mint-soft">
                          <Icon name="pin" className="h-7 w-7 text-mint-mid" />
                        </div>
                      )}
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <button onClick={() => openDetail(p)} className="min-w-0 flex-1 text-left">
                            <div className="truncate text-[17px] font-bold text-ink">{p.name}</div>
                            <div className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-muted">
                              {p.oneLineDescription}
                            </div>
                          </button>
                          <button
                            onClick={() => toggleFavorite(i)}
                            aria-label="찜하기"
                            className={favoriteIndexes.has(i) ? "text-rose-500" : "text-slate-300"}
                          >
                            <Icon
                              name="heart"
                              className={`h-[22px] w-[22px] ${favoriteIndexes.has(i) ? "fill-rose-500" : ""}`}
                            />
                          </button>
                        </div>
                        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[12px] text-muted">
                          {p.daeguDistrict && (
                            <span className="flex items-center gap-1">
                              <Icon name="pin" className="h-3.5 w-3.5" />
                              {p.daeguDistrict}
                            </span>
                          )}
                          {p.fee && <span className="truncate">{p.fee}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 border-t border-hairline px-3 py-2.5">
                      <button
                        onClick={() => openDetail(p)}
                        className="flex-1 rounded-full border border-hairline py-2 text-[13px] font-medium text-ink-soft"
                      >
                        상세 보기
                      </button>
                      <button
                        onClick={() => viewParkingFor(p)}
                        disabled={!p.daeguDistrict}
                        className="flex-1 rounded-full bg-mint-bg py-2 text-[13px] font-semibold text-accent disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        주차 정보
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex items-center gap-2 rounded-full bg-white p-1.5 pl-4 shadow-[0_1px_4px_rgba(17,24,39,0.07)]">
                <Icon name="sparkle" className="h-[18px] w-[18px] shrink-0 text-accent" />
                <span className="flex-1 truncate text-[14px] text-muted">다른 분위기로 다시 추천해보세요</span>
                <button
                  onClick={() => setView("input")}
                  className="shrink-0 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-white"
                >
                  다른 곳 추천
                </button>
              </div>
            </div>
          </>
        )}

        {view === "detail" && selectedPlace && (
          <>
            <ScreenHeader title="장소 정보" onBack={() => setView("results")} />
            <div className="flex flex-col gap-3 px-5">
              {selectedPlace.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- 외부 공공데이터 이미지, 도메인 사전등록 불필요한 일반 img로 처리
                <img src={selectedPlace.imageUrl} alt={selectedPlace.name} className="h-48 w-full rounded-2xl object-cover" />
              )}
              <div className="rounded-2xl bg-white px-4 py-4 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
                <h2 className="text-[20px] font-bold text-ink">{selectedPlace.name}</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{selectedPlace.reason}</p>
              </div>

              <div className="flex flex-col gap-2.5 rounded-2xl bg-white px-4 py-4 text-[14px] shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
                {selectedPlace.address && (
                  <div className="flex gap-2">
                    <Icon name="pin" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
                    <span className="text-ink-soft">{selectedPlace.address}</span>
                  </div>
                )}
                {selectedPlace.operatingHours && (
                  <div className="flex gap-2">
                    <Icon name="clock" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
                    <span className="text-ink-soft">{selectedPlace.operatingHours}</span>
                  </div>
                )}
                {selectedPlace.fee && (
                  <div className="flex gap-2">
                    <Icon name="bookmark" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
                    <span className="text-ink-soft">{selectedPlace.fee}</span>
                  </div>
                )}
              </div>

              {selectedPlace.features && selectedPlace.features.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedPlace.features.map((f, i) => (
                    <span key={i} className="rounded-full bg-mint-bg px-3 py-1.5 text-[13px] font-medium text-accent">
                      {f}
                    </span>
                  ))}
                </div>
              )}

              {selectedPlace.daeguDistrict && (
                <button
                  onClick={viewParking}
                  className="mt-1 flex items-center justify-center gap-1.5 rounded-full bg-accent py-3 text-[15px] font-semibold text-white"
                >
                  <Icon name="parking" className="h-[18px] w-[18px]" />
                  주차 정보 보기
                </button>
              )}
            </div>
          </>
        )}

        {view === "parking" && (
          <>
            <ScreenHeader
              title={`${selectedPlace?.name ?? ""} 주차 정보`}
              onBack={() => setView("detail")}
              right={
                <span className="p-1 text-slate-300">
                  <Icon name="heart" className="h-[22px] w-[22px]" />
                </span>
              }
            />
            <div className="flex flex-col gap-3 px-5">
              {parkingQuery.isLoading && (
                <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3.5 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                  <p className="text-[14px] text-muted">주차장 조회 중...</p>
                </div>
              )}
              {!parkingQuery.isLoading && parkingQuery.data?.spots.length === 0 && (
                <p className="px-1 text-[14px] text-muted">주차장 정보를 찾을 수 없습니다.</p>
              )}

              {!parkingQuery.isLoading && parkingQuery.data && parkingQuery.data.destination && (
                <KakaoMap
                  center={parkingQuery.data.destination}
                  destinationLabel={selectedPlace?.name ?? ""}
                  spots={parkingQuery.data.spots
                    .filter((s) => s.latitude !== null && s.longitude !== null)
                    .map((s) => ({
                      id: s.id,
                      name: s.name,
                      latitude: s.latitude!,
                      longitude: s.longitude!,
                      walkMinutes: s.walkMinutes,
                    }))}
                />
              )}

              {!parkingQuery.isLoading && parkingQuery.data && parkingQuery.data.spots.length > 0 && (
                <>
                  <div className="flex items-center justify-between px-1 pt-1">
                    <h2 className="flex items-center gap-1 text-[15px] font-bold text-ink">
                      주차장 목록
                      <Icon name="info" className="h-3.5 w-3.5 text-slate-300" />
                    </h2>
                    {parkingQuery.data.destination && <span className="text-[13px] text-muted">거리순</span>}
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {parkingQuery.data.spots.map((s) => {
                      const occ = occupancyLabel(s);
                      return (
                        <button
                          key={s.id}
                          onClick={() => openParkingDetail(s)}
                          className="flex w-full items-start gap-3 rounded-2xl bg-white px-4 py-3.5 text-left shadow-[0_1px_3px_rgba(17,24,39,0.05)]"
                        >
                          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint-soft text-[13px] font-bold text-mint-mid">
                            P
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-[16px] font-bold text-ink">{s.name}</span>
                              {s.ownerType && (
                                <span className="shrink-0 rounded-full bg-mint-bg px-2 py-0.5 text-[11px] font-medium text-accent">
                                  {s.ownerType}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 truncate text-[13px] text-muted">
                              {s.walkMinutes !== null && `도보 ${s.walkMinutes}분 (${s.distanceMeters}m)`}
                              {s.operatingHours && (s.walkMinutes !== null ? ` · 운영 ${s.operatingHours}` : `운영 ${s.operatingHours}`)}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            {occ && <div className={`text-[14px] font-bold ${occ.className}`}>{occ.label}</div>}
                            <div className="mt-0.5 text-[13px] text-muted">
                              {s.remainingSpaces ?? "-"} / {s.capacity}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex gap-2 rounded-2xl bg-slate-50 px-4 py-3.5 text-[12px] leading-relaxed text-muted">
                    <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                    <p>주차 요금 및 운영시간은 변동될 수 있어요. 방문 전 현장 안내를 확인해 주세요.</p>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {view === "parking-detail" && selectedParkingSpot && (
          <>
            <ScreenHeader title={selectedParkingSpot.name} onBack={() => setView("parking")} />
            <div className="flex flex-col gap-3 px-5">
              <div className="flex h-48 w-full items-center justify-center rounded-2xl bg-slate-100 text-[13px] text-slate-400">
                사진 영역
              </div>

              <div className="rounded-2xl bg-white px-4 py-4 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint-soft text-[13px] font-bold text-mint-mid">
                    P
                  </div>
                  <h2 className="min-w-0 truncate text-[18px] font-bold text-ink">{selectedParkingSpot.name}</h2>
                  {selectedParkingSpot.ownerType && (
                    <span className="shrink-0 rounded-full bg-mint-bg px-2 py-0.5 text-[11px] font-medium text-accent">
                      {selectedParkingSpot.ownerType}
                    </span>
                  )}
                </div>
                <div className="mt-2 text-[13px] text-muted">{selectedParkingSpot.address}</div>
              </div>

              <div className="rounded-2xl bg-mint-bg px-4 py-4">
                <div className="text-[13px] text-muted">현재 주차 여유</div>
                <div className="mt-1 flex items-end justify-between">
                  {(() => {
                    const occ = occupancyLabel(selectedParkingSpot);
                    return occ ? (
                      <span className={`text-[18px] font-bold ${occ.className}`}>{occ.label}</span>
                    ) : (
                      <span className="text-[14px] text-slate-400">정보 없음</span>
                    );
                  })()}
                  <span className="text-[20px] font-bold text-ink">
                    {selectedParkingSpot.remainingSpaces ?? "-"} / {selectedParkingSpot.capacity}면
                  </span>
                </div>
              </div>

              <div className="flex flex-col divide-y divide-hairline rounded-2xl bg-white px-4 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
                <div className="flex items-start gap-3 py-3.5">
                  <Icon name="clock" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
                  <div>
                    <div className="text-[12px] text-muted">운영시간</div>
                    <div className="mt-0.5 text-[14px] text-ink-soft">
                      {selectedParkingSpot.operatingHours ?? "정보 없음"}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 py-3.5">
                  <Icon name="bookmark" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
                  <div>
                    <div className="text-[12px] text-muted">주차 요금</div>
                    <div className="mt-0.5 flex flex-col text-[14px] text-ink-soft">
                      {selectedParkingSpot.feeLines?.map((line, i) => <span key={i}>{line}</span>) ?? "정보 없음"}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 py-3.5">
                  <Icon name="parking" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
                  <div>
                    <div className="text-[12px] text-muted">주차 형태</div>
                    <div className="mt-0.5 text-[14px] text-ink-soft">
                      {selectedParkingSpot.lotType ? `${selectedParkingSpot.lotType} 주차장` : "정보 없음"}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 py-3.5">
                  <Icon name="card" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
                  <div>
                    <div className="text-[12px] text-muted">결제 방법</div>
                    <div className="mt-0.5 text-[14px] text-ink-soft">
                      {selectedParkingSpot.paymentMethod ?? "정보 없음"}
                    </div>
                  </div>
                </div>
              </div>

              {selectedParkingSpot.remark && (
                <div className="flex gap-2 rounded-2xl bg-slate-50 px-4 py-3.5 text-[12px] leading-relaxed text-muted">
                  <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                  <p>{selectedParkingSpot.remark}</p>
                </div>
              )}

              <button
                onClick={() => setView("parking")}
                className="flex items-center justify-center gap-1.5 rounded-full bg-accent py-3 text-[14px] font-semibold text-white"
              >
                <Icon name="pin" className="h-4 w-4" />
                지도에서 보기
              </button>
              {selectedParkingSpot.latitude !== null && selectedParkingSpot.longitude !== null && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedParkingSpot.latitude},${selectedParkingSpot.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-full border border-hairline py-3 text-[14px] font-medium text-ink-soft"
                >
                  외부 지도 앱으로 길찾기
                </a>
              )}
            </div>
          </>
        )}

        {view === "mypage" && (
          <>
            <ScreenHeader
              title="마이페이지"
              onBack={() => setView("input")}
              right={
                <span className="p-1 text-muted">
                  <Icon name="gear" className="h-[22px] w-[22px]" />
                </span>
              }
            />
            <div className="flex flex-col gap-3 px-5">
              {/* ponytail: 로그인/저장은 이번 스코프 밖(팀 플로우차트상 "선택" 항목) —
                  디자인 목업을 화면에 반영하기 위한 더미 데이터. 실제 로그인·저장 붙이면 교체. */}
              <div className="rounded-2xl bg-white px-4 py-4 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-mint-soft">
                    <Icon name="user" className="h-7 w-7 text-mint-mid" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[17px] font-bold text-ink">로그인 사용자</div>
                    <div className="mt-0.5 text-[13px] text-muted">저장한 나들이와 설정을 관리해요.</div>
                  </div>
                  <Icon name="next" className="h-5 w-5 text-slate-300" />
                </div>
                <div className="mt-4 flex border-t border-hairline pt-3">
                  {[
                    { icon: "bookmark", label: "저장한 장소", value: MYPAGE_STATS.savedPlaces },
                    { icon: "clock", label: "최근 추천", value: MYPAGE_STATS.recentRecommendations },
                    { icon: "parking", label: "주차 저장", value: MYPAGE_STATS.savedParking },
                  ].map((stat, i) => (
                    <div
                      key={stat.label}
                      className={`flex flex-1 flex-col items-center gap-1 ${i > 0 ? "border-l border-hairline" : ""}`}
                    >
                      <span className="flex items-center gap-1 text-[12px] text-muted">
                        <Icon name={stat.icon} className="h-3.5 w-3.5 text-mint-mid" />
                        {stat.label}
                      </span>
                      <span className="text-[18px] font-bold text-ink">{stat.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between px-1 pt-1">
                <h2 className="text-[15px] font-bold text-ink">저장한 장소</h2>
                <span className="flex items-center gap-0.5 text-[13px] text-muted">
                  전체 보기
                  <Icon name="next" className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
                {MYPAGE_SAVED_PLACES.map((p, i) => (
                  <div
                    key={p.name}
                    className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-hairline" : ""}`}
                  >
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-mint-soft">
                      <Icon name="pin" className="h-5 w-5 text-mint-mid" />
                    </div>
                    <div className="flex-1">
                      <div className="text-[16px] font-bold text-ink">{p.name}</div>
                      <div className="mt-0.5 text-[13px] text-muted">{p.category}</div>
                    </div>
                    <Icon name="next" className="h-5 w-5 text-slate-300" />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between px-1 pt-1">
                <h2 className="text-[15px] font-bold text-ink">선호 조건</h2>
                <span className="flex items-center gap-0.5 text-[13px] text-muted">
                  전체 보기
                  <Icon name="next" className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {MYPAGE_PREFERENCES.map((pref) => (
                  <span
                    key={pref.label}
                    className="flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3.5 py-1.5 text-[13px] text-ink-soft"
                  >
                    {pref.icon === "won" ? (
                      <span className="text-[13px] font-semibold text-mint-mid">₩</span>
                    ) : (
                      <Icon name={pref.icon} className="h-3.5 w-3.5 text-mint-mid" />
                    )}
                    {pref.label}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between px-1 pt-1">
                <h2 className="text-[15px] font-bold text-ink">최근 질문</h2>
                <span className="flex items-center gap-0.5 text-[13px] text-muted">
                  전체 보기
                  <Icon name="next" className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
                {MYPAGE_RECENT_QUESTIONS.map((q, i) => (
                  <div
                    key={q.question}
                    className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-hairline" : ""}`}
                  >
                    <Icon name="sparkle" className="h-5 w-5 shrink-0 text-mint-mid" />
                    <div className="flex-1">
                      <div className="text-[14px] font-medium text-ink">{q.question}</div>
                      <div className="mt-0.5 text-[12px] text-muted">{q.date}</div>
                    </div>
                    <Icon name="next" className="h-5 w-5 text-slate-300" />
                  </div>
                ))}
              </div>

              <h2 className="px-1 pt-1 text-[15px] font-bold text-ink">설정</h2>
              <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
                {MYPAGE_SETTINGS_MENU.map((label, i) => (
                  <div
                    key={label}
                    className={`flex items-center justify-between px-4 py-3.5 text-[14px] font-medium text-ink ${
                      i > 0 ? "border-t border-hairline" : ""
                    }`}
                  >
                    {label}
                    <Icon name="next" className="h-5 w-5 text-slate-300" />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {showBottomNav && (
        <nav className="sticky bottom-0 mt-auto flex items-center justify-around border-t border-hairline bg-white/95 px-2 pb-2 pt-2 backdrop-blur">
          {[
            { id: "home", label: "홈", icon: "home", target: "input" as const, active: view === "input" },
            { id: "recommend", label: "추천", icon: "compass", target: "results" as const, active: view === "results" },
            { id: "saved", label: "저장", icon: "heart", target: "mypage" as const, active: false },
            { id: "mypage", label: "마이", icon: "user", target: "mypage" as const, active: view === "mypage" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.target === "results" && !recommendation) return;
                setView(tab.target);
              }}
              className={`flex flex-1 flex-col items-center gap-1 py-1 text-[11px] font-medium ${
                tab.active ? "text-accent" : "text-slate-400"
              }`}
            >
              <Icon name={tab.icon} className="h-[22px] w-[22px]" />
              {tab.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
