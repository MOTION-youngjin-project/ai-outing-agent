"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import type { ChatTurn } from "@/lib/agent";
import {
  fetchRegions,
  fetchWeather,
  fetchAirQuality,
  fetchParking,
  postRecommend,
  type RecommendResult,
  type PlaceWithMeta,
} from "@/lib/clientApi";
import { occupancyLabel } from "@/lib/parkingDisplay";
import { splitHeadline } from "@/lib/textFormat";
import { extractCategoryLabel } from "@/lib/services/matching";
import { FILTER_LABELS } from "@/lib/placeTags";
import { summarize } from "@/hooks/useRecommendationFlow";
import { useAppStore } from "@/lib/store";
import { Icon } from "@/components/Icon";
import { SidebarToggleButton } from "@/components/SidebarToggleButton";
import { PlanShareButton } from "@/components/PlanShareButton";
import { RecommendationSources } from "@/components/RecommendationSources";
import { PlaceMatchRecovery } from "@/components/PlaceMatchRecovery";
import { NearbyPlaces } from "@/components/NearbyPlaces";

// 카드에 보여줄 "혼잡도"는 관광지 자체의 실시간 방문자 혼잡도가 아니라(그런 데이터가
// 없음) 그 장소 근처 대구 주차장의 실시간 혼잡도다 — 이미 주차 상세 화면에 쓰는 것과
// 같은 데이터/로직(occupancyLabel)을 재사용한다. district가 있는 장소에서만 표시.
function ParkingCongestionBadge({ district, placeName }: { district: string; placeName: string }) {
  const { data } = useQuery({
    queryKey: ["parking-congestion", district, placeName],
    queryFn: () => fetchParking(district, placeName),
  });
  const closest = data?.spots[0];
  const occ = closest ? occupancyLabel(closest) : null;
  if (!occ) return null;

  return (
    <span className={`flex items-center gap-1 ${occ.className}`}>
      <Icon name="users" className="h-3.5 w-3.5" />
      {occ.label}
    </span>
  );
}

export function ResultsScreen({ recommendation, runId }: { recommendation: RecommendResult; runId: string }) {
  const { regionId, history, setHistory, setLastRecommendation } = useAppStore();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();

  // 남이 공유한 링크로 열면(isOwner=false) 결과만 읽기 전용으로 보여준다 — 재요청은 남의
  // 추천 이력에 덧붙이는 셈이라 막는다. 방금 만든 추천(isOwner 없음)은 그대로 전부 가능.
  const readOnly = recommendation.isOwner === false;

  // 새로고침/직링크로 들어오면 history가 비어있다 — 그럴 땐 지어내지 말고 사용자 버블을 생략한다.
  const lastUserMessage = [...history].reverse().find((t) => t.role === "user")?.content ?? null;

  // "다른 곳 추천": 홈으로 이동하지 않고 이 화면에서 바로 재요청한다(디자인/추천 결과.png).
  // 새로고침 등으로 history가 비어있으면 지금 보고 있는 추천 결과를 요약해 맥락으로 삼는다.
  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const baseHistory: ChatTurn[] =
        history.length > 0 ? history : [{ role: "assistant", content: summarize(recommendation) }];
      const historyWithUser: ChatTurn[] = [...baseHistory, { role: "user", content: "다른 곳으로 추천해줘" }];
      const rec = await postRecommend(historyWithUser);
      return { rec, historyWithUser };
    },
    onSuccess: ({ rec, historyWithUser }) => {
      setHistory([...historyWithUser, { role: "assistant", content: summarize(rec) }]);
      setLastRecommendation(rec);
      queryClient.setQueryData(["recommend", rec.agentRunId], rec);
      router.replace(`/recommend/${rec.agentRunId}`);
    },
  });

  const regionsQuery = useQuery({ queryKey: ["regions", "sido"], queryFn: fetchRegions });
  // 공유 링크로 열거나 새로고침하면 store(regionId)가 빈 값으로 시작한다(영속화 안 함,
  // 위 정책 참고) — 그럴 땐 추천 결과 자체에 담긴 place.daeguDistrict로 지역을 되찾는다.
  // 그래야 "계획 공유하기"로 받은 사람도 지역/날씨/대기질 배지를 그대로 볼 수 있다.
  const fallbackDistrict = recommendation.places?.find((p) => p.daeguDistrict)?.daeguDistrict ?? null;
  const effectiveRegionId =
    regionId || (regionsQuery.data ?? []).find((r) => r.name === fallbackDistrict)?.id || "";
  const regionName = (regionsQuery.data ?? []).find((r) => r.id === effectiveRegionId)?.name ?? fallbackDistrict ?? "";
  const weatherQuery = useQuery({
    queryKey: ["weather", effectiveRegionId],
    queryFn: () => fetchWeather(effectiveRegionId),
    enabled: !!effectiveRegionId,
  });
  const airQualityQuery = useQuery({
    queryKey: ["air-quality", effectiveRegionId],
    queryFn: () => fetchAirQuality(effectiveRegionId),
    enabled: !!effectiveRegionId,
  });

  // 찜 아이콘 — 로그인 상태면 /api/saved-places로 실제 저장까지 한다(로그아웃 상태면
  // 로그인 화면으로 유도).
  const [favoriteIndexes, setFavoriteIndexes] = useState<Set<number>>(new Set());
  // null = "전체" 선택 상태. 결과 카드의 tags 필드와 매칭해서 필터링한다.
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  // 카카오 category_name에서 뽑은 실제 소분류(예: "전시관", "카페") — 지어낸 카테고리가
  // 아니라 place.category(추천 결과에 이미 채워져 있는 값)만 드롭다운 옵션으로 쓴다.
  const categoryTags = Array.from(
    new Set((recommendation.places ?? []).map((p) => p.category).filter((t): t is string => !!t))
  );
  // 새 추천 결과가 들어오면(다른 곳 추천 등) 이전 필터 선택은 초기화한다. useEffect 대신
  // 렌더 중 비교(React 공식 권장 "prop 변경에 맞춰 state 조정" 패턴)로 처리 —
  // 리렌더 캐스케이드 없이 같은 렌더에서 바로 반영된다.
  const [prevRecommendation, setPrevRecommendation] = useState(recommendation);
  if (recommendation !== prevRecommendation) {
    setPrevRecommendation(recommendation);
    setActiveFilter(null);
  }

  // 원래 인덱스(i)를 같이 들고 있어야 찜하기(favoriteIndexes)가 필터링 후에도 올바른
  // 카드를 가리킨다.
  const filteredPlaces = (recommendation.places ?? [])
    .map((p, i) => ({ p, i }))
    .filter(
      ({ p }) => !activeFilter || (p.tags as readonly string[] | undefined)?.includes(activeFilter) || p.category === activeFilter
    );

  function openDetail(place: PlaceWithMeta) {
    if (!place.placeId) return;
    router.push(`/recommend/${runId}/place/${place.placeId}`);
  }

  function viewParkingFor(place: PlaceWithMeta) {
    if (!place.daeguDistrict || !place.placeId) return;
    router.push(`/recommend/${runId}/place/${place.placeId}/parking`);
  }

  // react-query 캐시(["recommend", runId])가 이 결과의 유일한 출처다 — 여기만 갱신하면
  // 상위 페이지가 이 컴포넌트에 새 recommendation prop을 내려주면서 filteredPlaces에도
  // 그대로 반영된다. 예전엔 로컬 상태(resolvedOverrides)에도 같은 값을 따로 들고 있었는데,
  // 새 recommendation prop이 들어오는 타이밍에 그 로컬 상태를 초기화해버려서 반영한 결과가
  // 화면에서 잠깐 원래대로 되돌아갈 수 있는 경쟁 상태가 있었다.
  function applyResolvedPlace(index: number, place: PlaceWithMeta) {
    queryClient.setQueryData<RecommendResult>(["recommend", runId], current => current?.places
      ? { ...current, places: current.places.map((item, placeIndex) => placeIndex === index ? place : item) }
      : current);
  }

  async function toggleFavorite(place: PlaceWithMeta, index: number) {
    if (!session) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    // 카카오 검색으로 실제 Place를 못 찾은 장소(placeId 없음)는 저장할 DB 행이 없어서
    // 막는다 — 버튼 자체를 disabled 처리했지만 방어적으로 한 번 더 확인.
    if (!place.placeId) return;

    const wasSaved = favoriteIndexes.has(index);
    setFavoriteIndexes((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(index);
      else next.add(index);
      return next;
    });

    try {
      if (wasSaved) {
        await fetch(`/api/saved-places?placeId=${encodeURIComponent(place.placeId)}`, { method: "DELETE" });
      } else {
        await fetch("/api/saved-places", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placeId: place.placeId }),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["saved-places"] });
    } catch {
      // 저장 요청 실패해도 조용히 무시 — 하트 표시만 낙관적으로 남고, 마이페이지
      // 목록은 실제 DB 기준(다음 조회)이라 다시 눌러보면 정확한 상태로 맞춰진다.
    }
  }

  // 목업의 AI 코멘트 카드는 굵은 한 줄 + 설명 본문 구조라, message의 첫 문장을 헤드라인으로 쓴다.
  const { headline: aiHeadline, body: aiBody } = splitHeadline(recommendation.message ?? "");

  return (
    <>
      <div className="flex items-center justify-between px-5 pb-1 pt-5">
        <SidebarToggleButton />
        {/* 디자인/추천 결과(정보 상세보기).png 원문 그대로는 "장소 상세 보기"인데, 이
            화면은 이 코스로 들어온 사람이 "코스 상세 보기"를 눌러 오는 목록 화면이라
            트리거 버튼과 맞춰 이 문구를 쓴다. */}
        <h1 className="text-[17px] font-bold text-ink">코스 상세 보기</h1>
        <button
          onClick={() => router.push("/")}
          aria-label="새 질문"
          className="sk sk-slot h-9 w-9 bg-white text-ink"
        >
          <Icon name="plus" className="h-4 w-4" />
        </button>
      </div>
      {/* 화면 진입 시 구역이 순서대로 도착한다 — 공유 버튼 → 환경 정보 → 질문 →
          AI 코멘트 → 필터 → 결과 목록 → 다시 추천. 결과 카드는 그 안에서 다시
          40ms씩 이어진다(카드마다 inline animationDelay). */}
      <div className="sk-stagger flex flex-col gap-3 px-5 pt-3">
        <PlanShareButton recommendation={recommendation} />
        <div className="sk-panel sk-enter flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 text-[13px]">
          <span className="flex items-center gap-1.5">
            <Icon name="pin" className="h-[18px] w-[18px] text-muted" />
            <span className="font-medium text-ink-soft">{regionName || "-"}</span>
          </span>
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

        {lastUserMessage && (
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-[16px_4px_3px_16px] border border-mint-soft bg-mint-bg px-4 py-2.5 text-[14px] text-ink">
              {lastUserMessage}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 px-1 text-[12px] font-semibold text-accent">
          <Icon name="sparkle" className="h-3.5 w-3.5" />
          AI 추천
        </div>

        <div className="sk-panel sk-enter border-accent/40 bg-mint-bg px-4 py-4">
          <div className="flex gap-2">
            <Icon name="sparkle" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-accent" />
            <div className="flex flex-col gap-1.5">
              <p className="text-[16px] font-bold leading-snug text-ink">{aiHeadline}</p>
              {aiBody && <p className="text-[13px] leading-relaxed text-muted">{aiBody}</p>}
            </div>
          </div>
        </div>
        {/* ponytail: 정류지 간 이동시간(자동차)은 네이버 Directions로 채워서 카드 사이에
            표시함. 코스 합산 시간/비용은 여전히 API 미제공이라 비워둠. */}

        <div className="sk-stagger flex gap-2 overflow-x-auto pb-2.5 pt-1">
          {categoryTags.length > 0 && (
            <select
              value={categoryTags.includes(activeFilter ?? "") ? (activeFilter as string) : categoryTags[0]}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="sk-input shrink-0 px-3 py-1.5 text-[13px] font-medium text-ink-soft outline-none"
            >
              {categoryTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setActiveFilter(null)}
            className={
              activeFilter === null
                ? "sk sk-on flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 text-[13px]"
                : "sk shrink-0 px-3.5 py-1.5 text-[13px] font-medium text-muted"
            }
          >
            전체
          </button>
          {FILTER_LABELS.map((label) => (
            <button
              key={label}
              onClick={() => setActiveFilter(activeFilter === label ? null : label)}
              className={
                activeFilter === label
                  ? "sk sk-on flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 text-[13px]"
                  : "sk shrink-0 px-3.5 py-1.5 text-[13px] font-medium text-muted"
              }
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          {filteredPlaces.length === 0 && (
            <div className="py-6 text-center text-[13px] text-muted">해당 조건에 맞는 장소가 없어요.</div>
          )}
          {filteredPlaces.map(({ p, i }, idx) => (
            // display:contents로 레이아웃엔 안 끼고, 카드+이동시간 줄 두 형제를 한 key 아래 묶기만 한다.
            <div key={i} className="contents">
            <div
              className="sk-panel sk-enter flex overflow-hidden"
              style={{ animationDelay: `${Math.min(idx, 6) * 45}ms` }}
            >
              <button onClick={() => openDetail(p)} className="relative w-[132px] shrink-0">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 외부 공공데이터 이미지, 도메인 사전등록 불필요한 일반 img로 처리
                  <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full min-h-[120px] w-full items-center justify-center bg-mint-soft">
                    <Icon name="pin" className="h-7 w-7 text-mint-mid" />
                  </div>
                )}
                {extractCategoryLabel(p.category ?? null) && (
                  <span className="sk-tag absolute left-2 top-2 bg-white">
                    {extractCategoryLabel(p.category ?? null)}
                  </span>
                )}
              </button>
              <div className="flex min-w-0 flex-1 flex-col p-3">
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => openDetail(p)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-[16px] font-bold text-ink">{p.name}</div>
                    <div className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted">
                      {p.oneLineDescription}
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => openDetail(p)}
                      disabled={!p.placeId}
                      aria-label="상세 보기"
                      className="sk sk-primary sk-slot h-7 w-7"
                    >
                      <Icon name="arrowUpRight" className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => toggleFavorite(p, i)}
                      disabled={!!session && !p.placeId}
                      title={session && !p.placeId ? "저장할 수 없는 장소입니다" : undefined}
                      aria-label="찜하기"
                      className={
                        favoriteIndexes.has(i)
                          ? "sk-slot sk-slot-on h-7 w-7"
                          : "sk-slot h-7 w-7 border-[var(--sk-line)] bg-white text-muted"
                      }
                    >
                      <Icon name={favoriteIndexes.has(i) ? "check" : "checkCircle"} className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <RecommendationSources sources={p.sources} verification={p.verification} closedDays={p.closedDays} />
                <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-[11px] text-muted">
                  {(p.daeguDistrict || (p.distanceKm !== null && p.distanceKm !== undefined)) && (
                    <span className="flex items-center gap-1">
                      <Icon name="pin" className="h-3.5 w-3.5" />
                      {[p.daeguDistrict, p.distanceKm != null ? `${p.distanceKm}km` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                  {p.daeguDistrict && <ParkingCongestionBadge district={p.daeguDistrict} placeName={p.name} />}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => openDetail(p)}
                    disabled={!p.placeId}
                    className="sk sk-quiet flex-1 py-1.5 text-[12px] font-semibold text-muted"
                  >
                    상세 보기
                  </button>
                  <button
                    onClick={() => viewParkingFor(p)}
                    disabled={!p.daeguDistrict || !p.placeId}
                    className="sk flex-1 py-1.5 text-[12px] font-bold text-accent-deep"
                  >
                    주차 정보
                  </button>
                </div>
                {!p.placeId && (
                  <PlaceMatchRecovery runId={runId} placeIndex={i} placeName={p.name} readOnly={readOnly}
                    onResolved={place => applyResolvedPlace(i, place)} />
                )}
              </div>
            </div>
            <NearbyPlaces name={p.name} category={p.category} latitude={p.latitude} longitude={p.longitude} exclude={(recommendation.places ?? []).map((place) => place.name)} />
            {/* 필터링 중엔 화면상 인접 카드가 실제 코스 순서상 인접이 아닐 수 있어 — 전체
                보기(activeFilter === null)일 때만 이동시간을 보여준다. */}
            {activeFilter === null &&
              idx < filteredPlaces.length - 1 &&
              filteredPlaces[idx + 1].p.travelDurationMin != null && (
                <div className="px-1 text-[12px] font-medium text-muted">
                  차로 {filteredPlaces[idx + 1].p.travelDurationMin}분 이동
                </div>
              )}
            </div>
          ))}
        </div>

        {readOnly ? (
          <p className="sk-panel mt-2 px-4 py-2.5 text-center text-[13px] text-muted">
            공유받은 추천이라 다시 추천은 할 수 없어요. 홈에서 직접 추천받아보세요.
          </p>
        ) : (
        <div className="sk-panel sk-enter mt-2 flex items-center gap-2 py-1.5 pl-4 pr-1.5">
          <Icon name="sparkle" className="h-4 w-4 shrink-0 text-accent" />
          <span className="flex-1 truncate text-[13px] text-ink-soft">다른 분위기로 다시 추천해보세요</span>
          <button
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
            className={`sk sk-primary shrink-0 whitespace-nowrap px-4 py-2 text-[13px] ${regenerateMutation.isPending ? "sk-loading" : ""}`}
          >
            {regenerateMutation.isPending ? "추천 중..." : "다른 곳 추천"}
          </button>
        </div>
        )}
        {regenerateMutation.isError && (
          <p className="px-1 text-[12px] text-red-500">다시 추천하지 못했어요. 잠시 후 다시 시도해주세요.</p>
        )}
      </div>
    </>
  );
}
