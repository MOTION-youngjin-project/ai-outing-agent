"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ChatTurn, Recommendation } from "@/lib/agent";
import type { ParkingSpot } from "@/lib/tools/parking";
import { useAppStore, type Place } from "@/lib/store";

type Region = { id: string; parentId: string | null; name: string; level: string };
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

async function postRecommend(history: ChatTurn[]): Promise<Recommendation> {
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
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "알 수 없는 오류가 발생했습니다.");
  return data.recommendation as Recommendation;
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

async function fetchParking(district: string): Promise<ParkingSpot[]> {
  try {
    const res = await fetch(`/api/parking?district=${encodeURIComponent(district)}`);
    const data = await res.json();
    return res.ok ? data.spots : [];
  } catch {
    return [];
  }
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
  const { view, input, history, selectedPlace, regionId, setView, setInput, setHistory, selectPlace, setRegionId } =
    useAppStore();

  // 서버/클라이언트 초기 렌더가 일치해야 하므로 고정값으로 시작하고, 마운트 후에만 랜덤화한다.
  // 순수 장식용 클라이언트 상태라 전역 스토어로 옮기지 않았다.
  const [localSuggestion, setLocalSuggestion] = useState(SUGGESTIONS[0]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 의도적으로 클라이언트에서만 랜덤화 (서버와 값이 달라도 되는 장식용 텍스트)
    setLocalSuggestion(randomSuggestion());
  }, []);

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

  const suggestMutation = useMutation({ mutationFn: postSuggest });
  const recommendMutation = useMutation({
    mutationFn: postRecommend,
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
    queryKey: ["parking", selectedPlace?.daeguDistrict],
    queryFn: () => fetchParking(selectedPlace!.daeguDistrict!),
    enabled: view === "parking" && !!selectedPlace?.daeguDistrict,
  });

  const recommendation = recommendMutation.data ?? null;
  const promptMessage = recommendation?.needsMoreInfo ? recommendation.message : null;
  const errorMessage = recommendMutation.error instanceof Error ? recommendMutation.error.message : null;
  const displayedSuggestion =
    recommendMutation.isPending || suggestMutation.isPending
      ? ""
      : (suggestMutation.data ?? localSuggestion);

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

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-2xl flex-1 flex-col px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold text-black dark:text-zinc-50">
          나들이 추천 에이전트
        </h1>

        {(view === "input" || view === "loading") && (
          <div className="flex flex-1 flex-col">
            <select
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
              disabled={view === "loading"}
              className="mb-4 self-start rounded-full border border-zinc-300 bg-transparent px-4 py-2 text-sm outline-none disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
            >
              <option value="">지역을 선택하세요</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {(weatherQuery.data || airQualityQuery.data) && (
              <div className="mb-4 flex flex-wrap gap-3 text-xs text-zinc-500">
                {weatherQuery.data && (
                  <span>
                    {weatherQuery.data.summary}
                    {weatherQuery.data.temperatureC !== null ? `, ${weatherQuery.data.temperatureC}도` : ""}
                    {weatherQuery.data.precipitationProbability !== null
                      ? `, 강수확률 ${weatherQuery.data.precipitationProbability}%`
                      : ""}
                  </span>
                )}
                {airQualityQuery.data && (
                  <span>
                    미세먼지 {airQualityQuery.data.overallGrade}
                    {airQualityQuery.data.pm10Value !== null ? `(${airQualityQuery.data.pm10Value}㎍/m³)` : ""}
                  </span>
                )}
              </div>
            )}
            {promptMessage && (
              <div className="mb-4 rounded-lg bg-white px-4 py-3 text-sm text-black dark:bg-zinc-900 dark:text-zinc-50">
                {promptMessage}
              </div>
            )}
            {errorMessage && (
              <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                오류: {errorMessage}
              </div>
            )}
            {view === "loading" ? (
              <p className="text-zinc-500">
                생각하는 중... (날씨·대기질 등 도구 여러 개를 확인하느라 시간이 걸릴 수 있어요)
              </p>
            ) : (
              !promptMessage && (
                <p className="text-zinc-500">
                  예: &quot;애기랑 나갈만한 곳 있어? 유모차도 가지고 갈 거야&quot;
                </p>
              )
            )}

            <div className="mt-auto flex flex-col gap-2 pt-4">
              {!recommendMutation.isPending && !suggestMutation.isPending && suggestMutation.data && !input && (
                <button
                  type="button"
                  onClick={acceptSuggestion}
                  className="self-start rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  {suggestMutation.data}
                </button>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
                className="flex gap-2"
              >
                <div className="relative flex-1">
                  {!input && (
                    <div className="pointer-events-none absolute inset-0 flex items-center truncate rounded-full px-4 text-sm text-zinc-400 dark:text-zinc-600">
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
                    className="relative w-full rounded-full border border-zinc-300 bg-transparent px-4 py-2 text-sm outline-none disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
                  />
                </div>
                <button
                  type="submit"
                  disabled={view === "loading" || !regionId}
                  className="rounded-full bg-black px-5 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-black"
                >
                  보내기
                </button>
              </form>
            </div>

            <div className="mt-10 flex flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
              <h2 className="text-sm font-medium text-zinc-500">장소 검색</h2>
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
                  className="flex-1 rounded-full border border-zinc-300 bg-transparent px-4 py-2 text-sm outline-none dark:border-zinc-700 dark:text-zinc-50"
                />
                <button
                  type="submit"
                  disabled={placesMutation.isPending || !placeQuery.trim()}
                  className="rounded-full border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
                >
                  검색
                </button>
              </form>
              {placesMutation.isPending && <p className="text-xs text-zinc-500">검색 중...</p>}
              {placesMutation.data && (
                <div className="flex flex-col gap-2">
                  {placesMutation.data.length === 0 && (
                    <p className="text-xs text-zinc-500">검색 결과가 없습니다.</p>
                  )}
                  {placesMutation.data.map((p) => (
                    <div key={p.id} className="rounded-lg bg-white px-4 py-3 text-sm dark:bg-zinc-900 dark:text-zinc-50">
                      <div className="font-medium">{p.name}</div>
                      {p.roadAddress && <div className="text-zinc-500">{p.roadAddress}</div>}
                      {p.categorySummary && <div className="text-xs text-zinc-400">{p.categorySummary}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8 flex flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
              <h2 className="text-sm font-medium text-zinc-500">문화행사 검색 (전국 결과, 지역 필터 없음)</h2>
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
                  className="rounded-full border border-zinc-300 bg-transparent px-4 py-2 text-sm outline-none dark:border-zinc-700 dark:text-zinc-50"
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
                  placeholder="제목 검색어 (선택, 예: 대구)"
                  className="flex-1 rounded-full border border-zinc-300 bg-transparent px-4 py-2 text-sm outline-none dark:border-zinc-700 dark:text-zinc-50"
                />
                <button
                  type="submit"
                  disabled={cultureMutation.isPending}
                  className="rounded-full border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
                >
                  검색
                </button>
              </form>
              {cultureMutation.isPending && <p className="text-xs text-zinc-500">검색 중...</p>}
              {cultureMutation.data && (
                <div className="flex flex-col gap-2">
                  {cultureMutation.data.length === 0 && (
                    <p className="text-xs text-zinc-500">검색 결과가 없습니다.</p>
                  )}
                  {cultureMutation.data.map((event, i) => (
                    <div key={i} className="rounded-lg bg-white px-4 py-3 text-sm dark:bg-zinc-900 dark:text-zinc-50">
                      <div className="font-medium">{event.title}</div>
                      <div className="text-zinc-500">
                        {event.eventSite} · {event.eventPeriod}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {view === "results" && recommendation?.places && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-black dark:text-zinc-50">{recommendation.message}</p>
            <div className="flex flex-col gap-3">
              {recommendation.places.map((p, i) => (
                <button
                  key={i}
                  onClick={() => openDetail(p)}
                  className="rounded-lg bg-white px-4 py-3 text-left text-sm hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
                >
                  <div className="font-medium">{p.name}</div>
                  <div className="text-zinc-500">{p.oneLineDescription}</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setView("input")}
              className="mt-2 self-start rounded-full border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:text-zinc-50"
            >
              다른 조건으로 찾기
            </button>
          </div>
        )}

        {view === "detail" && selectedPlace && (
          <div className="flex flex-col gap-4">
            <button onClick={() => setView("results")} className="self-start text-sm text-zinc-500">
              ← 목록으로
            </button>
            {selectedPlace.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- 외부 공공데이터 이미지, 도메인 사전등록 불필요한 일반 img로 처리
              <img src={selectedPlace.imageUrl} alt={selectedPlace.name} className="rounded-lg" />
            )}
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">{selectedPlace.name}</h2>
            <p className="text-sm text-black dark:text-zinc-50">{selectedPlace.reason}</p>
            <dl className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
              {selectedPlace.address && <div><dt className="inline font-medium">위치: </dt><dd className="inline">{selectedPlace.address}</dd></div>}
              {selectedPlace.operatingHours && <div><dt className="inline font-medium">운영시간: </dt><dd className="inline">{selectedPlace.operatingHours}</dd></div>}
              {selectedPlace.fee && <div><dt className="inline font-medium">이용요금: </dt><dd className="inline">{selectedPlace.fee}</dd></div>}
            </dl>
            {selectedPlace.features && selectedPlace.features.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-zinc-600 dark:text-zinc-400">
                {selectedPlace.features.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            )}
            {selectedPlace.daeguDistrict && (
              <button
                onClick={viewParking}
                className="self-start rounded-full bg-black px-4 py-2 text-sm text-white dark:bg-zinc-50 dark:text-black"
              >
                주차 정보 보기
              </button>
            )}
          </div>
        )}

        {view === "parking" && (
          <div className="flex flex-col gap-4">
            <button onClick={() => setView("detail")} className="self-start text-sm text-zinc-500">
              ← 장소 정보로
            </button>
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              {selectedPlace?.daeguDistrict} 주차장 정보
            </h2>
            {parkingQuery.isLoading && <p className="text-zinc-500">주차장 조회 중...</p>}
            {!parkingQuery.isLoading && parkingQuery.data?.length === 0 && (
              <p className="text-zinc-500">주차장 정보를 찾을 수 없습니다.</p>
            )}
            {!parkingQuery.isLoading &&
              parkingQuery.data?.map((s, i) => (
                <div key={i} className="rounded-lg bg-white px-4 py-3 text-sm dark:bg-zinc-900 dark:text-zinc-50">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-zinc-500">{s.address}</div>
                  <div className="text-zinc-500">
                    주차 {s.capacity}면 · {s.fee} · {s.hasRealtime ? "실시간 잔여면수 제공" : "실시간 정보 없음"}
                  </div>
                </div>
              ))}
          </div>
        )}
      </main>
    </div>
  );
}
