"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ChatTurn, Recommendation } from "@/lib/agent";
import type { ParkingSpot } from "@/lib/tools/parking";
import { useAppStore, type Place } from "@/lib/store";

const SUGGESTIONS = [
  "서울에서 애기랑 나갈만한 곳 있어? 유모차도 가지고 갈 거야",
  "대구에서 여자친구랑 데이트할만한 곳 있어?",
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

async function postAgent(history: ChatTurn[]): Promise<Recommendation> {
  let res: Response;
  try {
    res = await fetch("/api/agent", {
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

export default function Home() {
  const { view, input, history, selectedPlace, setView, setInput, setHistory, selectPlace } =
    useAppStore();

  // 서버/클라이언트 초기 렌더가 일치해야 하므로 고정값으로 시작하고, 마운트 후에만 랜덤화한다.
  // 순수 장식용 클라이언트 상태라 전역 스토어로 옮기지 않았다.
  const [localSuggestion, setLocalSuggestion] = useState(SUGGESTIONS[0]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 의도적으로 클라이언트에서만 랜덤화 (서버와 값이 달라도 되는 장식용 텍스트)
    setLocalSuggestion(randomSuggestion());
  }, []);

  const suggestMutation = useMutation({ mutationFn: postSuggest });
  const agentMutation = useMutation({
    mutationFn: postAgent,
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

  const recommendation = agentMutation.data ?? null;
  const promptMessage = recommendation?.needsMoreInfo ? recommendation.message : null;
  const errorMessage = agentMutation.error instanceof Error ? agentMutation.error.message : null;
  const displayedSuggestion =
    agentMutation.isPending || suggestMutation.isPending
      ? ""
      : (suggestMutation.data ?? localSuggestion);

  function acceptSuggestion() {
    if (!input && displayedSuggestion) setInput(displayedSuggestion);
  }

  function sendMessage() {
    const text = input.trim();
    if (!text || agentMutation.isPending) return;

    const historyWithUser: ChatTurn[] = [...history, { role: "user", content: text }];
    setHistory(historyWithUser);
    setInput("");
    agentMutation.reset();
    suggestMutation.reset();
    setView("loading");
    agentMutation.mutate(historyWithUser);
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
                  예: &quot;서울에서 애기랑 나갈만한 곳 있어? 유모차도 가지고 갈 거야&quot;
                </p>
              )
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="mt-auto flex gap-2 pt-4"
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
                disabled={view === "loading"}
                className="rounded-full bg-black px-5 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-black"
              >
                보내기
              </button>
            </form>
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
