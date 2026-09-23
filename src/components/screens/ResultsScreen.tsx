"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  fetchRegions,
  fetchWeather,
  fetchAirQuality,
  fetchParking,
  type RecommendResult,
  type PlaceWithMeta,
} from "@/lib/clientApi";
import { occupancyLabel } from "@/lib/parkingDisplay";
import { splitHeadline } from "@/lib/textFormat";
import { extractCategoryLabel, shortRegionName } from "@/lib/services/matching";
import { FILTER_LABELS } from "@/lib/placeTags";
import { ANOTHER_PLACE_TEXT, summarize } from "@/hooks/useRecommendationFlow";
import { canGoBackInApp, noteReplace, useBack } from "@/lib/useBack";
import { useAppStore } from "@/lib/store";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { FilterMenu } from "@/components/FilterMenu";
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
  const {
    regionId,
    history,
    setHistory,
    setLastRecommendation,
    recommendations,
    setRecommendations,
    setConversationId,
    setInput,
    setQueuedTurn,
  } = useAppStore();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();

  // 남이 공유한 링크로 열면(isOwner=false) 결과만 읽기 전용으로 보여준다 — 재요청은 남의
  // 추천 이력에 덧붙이는 셈이라 막는다. 방금 만든 추천(isOwner 없음)은 그대로 전부 가능.
  const readOnly = recommendation.isOwner === false;

  // 새로고침/직링크로 들어오면 history가 비어있다 — 그럴 땐 지어내지 말고 사용자 버블을 생략한다.
  const lastUserMessage = [...history].reverse().find((t) => t.role === "user")?.content ?? null;

  // "다른 곳 추천".
  // 예전엔 이 화면에서 직접 재요청했다 — 그런데 history에만 턴을 덧붙이고 채팅의
  // recommendations는 갱신하지 않아서, 채팅으로 돌아가면 답 없는 "다른 곳으로
  // 추천해줘" 말풍선이 남았고 새 결과는 별도 대화로 저장됐다. 이제는 채팅으로
  // 돌아가서 같은 입구(useRecommendationFlow.sendTurn)로 보낸다 — 진행 단계와 새
  // 카드가 대화 안에 쌓이고, 지금 보던 결과도 위에 그대로 남는다.
  const goBack = useBack("/");
  function requestAnotherInChat() {
    const inChat = recommendations.some((r) => r?.agentRunId === runId);
    if (!inChat) {
      // 채팅에 없는 결과(기록·직링크로 연 경우) — 이 결과를 맥락으로 새 대화를 연다.
      // 지어낸 사용자 질문을 넣지 않으려고 AI 요약만 앞에 둔다.
      setHistory([{ role: "assistant", content: summarize(recommendation) }]);
      setRecommendations([]);
      setLastRecommendation(recommendation);
      setConversationId(null);
    }
    setQueuedTurn(ANOTHER_PLACE_TEXT);
    if (inChat && canGoBackInApp()) {
      router.back();
    } else {
      noteReplace();
      router.replace("/");
    }
  }

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

  // 홈(채팅)의 "새 질문"과 같은 초기화 — 그쪽과 한 글자도 다르지 않게 맞춘다.
  function startNewQuestion() {
    setHistory([]);
    setInput("");
    setLastRecommendation(null);
    setRecommendations([]);
    setConversationId(null);
    router.push("/");
  }

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
      {/* 이 화면은 채팅에서 "코스 상세"를 눌러 들어오는 하위 화면이다 — 돌아갈 곳이
          분명한데도 왼쪽이 사이드바(기록) 버튼이라 나가는 길이 안 보였다. 대중교통·
          주차 화면과 같은 ScreenHeader(뒤로 + 제목)를 써서 형태를 맞춘다.
          오른쪽 +는 "새 질문"이라는 이름대로 대화를 비우고 홈으로 간다 — 예전엔 홈으로
          이동만 해서 뒤로가기와 하는 일이 똑같았다. */}
      <ScreenHeader
        title="코스 상세 보기"
        onBack={goBack}
        right={
          <button
            onClick={startNewQuestion}
            aria-label="새 질문"
            className="sk sk-slot h-9 w-9 bg-white text-ink"
          >
            <Icon name="plus" className="h-4 w-4" />
          </button>
        }
      />
      {/* 화면 진입 시 구역이 순서대로 도착한다 — 공유 버튼 → 환경 정보 → 질문 →
          AI 코멘트 → 필터 → 결과 목록 → 다시 추천. 결과 카드는 그 안에서 다시
          40ms씩 이어진다(카드마다 inline animationDelay). */}
      <div className="sk-stagger flex flex-col gap-3 px-5 pt-3">
        <PlanShareButton recommendation={recommendation} />
        {/* 지역·대기질·날씨 세 조각이 한 줄에 겨우 안 들어가 "25°C · 흐림"만 두 번째
            줄로 떨어졌다 — 간격을 줄이고 지역명을 홈 화면 배지와 같은 짧은 표기로
            맞추면 한 줄에 앉는다(대구광역시 → 대구). */}
        <div className="sk-panel sk-enter flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 text-[13px]">
          <span className="flex items-center gap-1.5">
            <Icon name="pin" className="h-[18px] w-[18px] text-muted" />
            <span className="font-medium text-ink-soft">{shortRegionName(regionName) || "-"}</span>
          </span>
          {airQualityQuery.data && (
            // 아이콘 하나만 28px 슬롯에 담겨 있어서 줄이 넘쳐 두 줄로 접혔다 —
            // 옆의 지역·날씨와 같은 맨 아이콘으로 맞추면 한 줄에 들어간다.
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

        {/* 조건 고르기 — 옆으로 미는 칩 줄을 버튼 하나로 접었다. 조건이 한 줄에
            다 안 들어가서 뒤쪽은 밀어봐야 있는 줄 알 수 있었고, 지금 뭘로 걸러져
            있는지도 줄을 끝까지 봐야 했다. 이제 버튼이 선택을 그대로 보여주고,
            누르면 아래로 창이 펴지며 모든 조건이 한눈에 들어온다. */}
        <div className="pb-1 pt-1">
          <FilterMenu
            groups={[
              { label: "장소 종류", options: categoryTags },
              { label: "분위기", options: FILTER_LABELS },
            ]}
            value={activeFilter}
            onChange={setActiveFilter}
            resultCount={filteredPlaces.length}
          />
        </div>

        <div className="flex flex-col gap-3">
          {filteredPlaces.length === 0 && (
            <div className="sk-panel sk-enter flex flex-col items-center gap-2 px-4 py-7 text-center">
              <span className="sk-slot h-9 w-9">
                <Icon name="search" className="h-4 w-4 text-mint-mid" />
              </span>
              <p className="text-[13px] text-muted">이 조건에 맞는 장소가 없어요.</p>
              <button
                onClick={() => setActiveFilter(null)}
                className="sk sk-quiet px-3.5 py-1.5 text-[12px] font-semibold text-ink-soft"
              >
                전체 보기
              </button>
            </div>
          )}
          {filteredPlaces.map(({ p, i }, idx) => (
            // display:contents로 레이아웃엔 안 끼고, 카드+이동시간 줄 두 형제를 한 key 아래 묶기만 한다.
            <div key={i} className="contents">
            {/* 카드 구조를 바꿨다. 예전엔 132px 이미지가 세로 전체를 차지하고 그 옆
                230px짜리 좁은 칸에 이름·설명·출처·배지·버튼을 전부 욱여넣어서, 긴 문장이
                서너 글자씩 끊겨 읽혔다. 이제 위 줄만 [작은 썸네일 + 이름·설명]으로 두고,
                출처·배지·버튼은 카드 전체 폭을 쓴다. 보여주는 정보와 순서는 그대로다. */}
            <div
              className="sk-panel sk-enter flex flex-col p-3"
              style={{ animationDelay: `${Math.min(idx, 6) * 45}ms` }}
            >
              <div className="flex gap-3">
                <button onClick={() => openDetail(p)} aria-label={`${p.name} 상세 보기`} className="shrink-0">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 외부 공공데이터 이미지, 도메인 사전등록 불필요한 일반 img로 처리
                    <img src={p.imageUrl} alt={p.name} className="sk-thumb h-[76px] w-[76px]" />
                  ) : (
                    <span className="sk-slot h-[76px] w-[76px]">
                      <Icon name="pin" className="h-6 w-6 text-mint-mid" />
                    </span>
                  )}
                </button>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start gap-2">
                    <button onClick={() => openDetail(p)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-[16px] font-bold leading-snug text-ink">{p.name}</div>
                      <div className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted">
                        {p.oneLineDescription}
                      </div>
                    </button>
                    {/* 상세로 가는 길은 썸네일·제목·아래 "상세 보기" 버튼까지 이미 셋이다.
                        네 번째였던 ↗ 아이콘 버튼은 빼고 찜하기만 남긴다. */}
                    <button
                      onClick={() => toggleFavorite(p, i)}
                      disabled={!!session && !p.placeId}
                      title={session && !p.placeId ? "저장할 수 없는 장소입니다" : undefined}
                      aria-label={favoriteIndexes.has(i) ? "저장 해제" : "저장하기"}
                      aria-pressed={favoriteIndexes.has(i)}
                      className={
                        favoriteIndexes.has(i)
                          ? "sk-slot sk-slot-on h-8 w-8"
                          : "sk-slot h-8 w-8 border-[var(--sk-line)] bg-white text-muted"
                      }
                    >
                      <Icon name={favoriteIndexes.has(i) ? "check" : "checkCircle"} className="h-4 w-4" />
                    </button>
                  </div>
                  {/* 종류·구·거리·주차 혼잡도를 이름 바로 아래 한 줄로 모은다 —
                      카테고리는 예전엔 빈 민트색 썸네일 위에 떠 있어서 붙을 곳이 없었다. */}
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                    {extractCategoryLabel(p.category ?? null) && (
                      <span className="sk-tag">{extractCategoryLabel(p.category ?? null)}</span>
                    )}
                    {(p.daeguDistrict || p.distanceKm != null) && (
                      <span className="flex items-center gap-1">
                        <Icon name="pin" className="h-3.5 w-3.5" />
                        {[p.daeguDistrict, p.distanceKm != null ? `${p.distanceKm}km` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                    {p.daeguDistrict && <ParkingCongestionBadge district={p.daeguDistrict} placeName={p.name} />}
                  </div>
                </div>
              </div>

              {/* 출처·휴무는 카드 폭을 그대로 쓴다 — 여기가 제일 긴 문장이 들어오는 자리다 */}
              <div className="mt-3 border-t border-[var(--sk-line-soft)] pt-2.5">
                <RecommendationSources sources={p.sources} verification={p.verification} closedDays={p.closedDays} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => openDetail(p)}
                  disabled={!p.placeId}
                  className="sk sk-quiet py-2 text-[13px] font-semibold text-muted"
                >
                  상세 보기
                </button>
                <button
                  onClick={() => viewParkingFor(p)}
                  disabled={!p.daeguDistrict || !p.placeId}
                  className="sk py-2 text-[13px] font-bold text-accent-deep"
                >
                  주차 정보
                </button>
              </div>
              {!p.placeId && (
                <PlaceMatchRecovery runId={runId} placeIndex={i} placeName={p.name} readOnly={readOnly}
                  onResolved={place => applyResolvedPlace(i, place)} />
              )}
            </div>
            <NearbyPlaces name={p.name} category={p.category} latitude={p.latitude} longitude={p.longitude} exclude={(recommendation.places ?? []).map((place) => place.name)} />
            {/* 필터링 중엔 화면상 인접 카드가 실제 코스 순서상 인접이 아닐 수 있어 — 전체
                보기(activeFilter === null)일 때만 이동시간을 보여준다. */}
            {activeFilter === null &&
              idx < filteredPlaces.length - 1 &&
              filteredPlaces[idx + 1].p.travelDurationMin != null && (
                // 코스 목록(CourseStopList)의 이동 구간과 같은 태그 조형을 쓴다 —
                // 채팅 카드와 이 화면이 같은 것을 다르게 그리고 있었다.
                <div className="flex items-center gap-2 px-1">
                  <span className="sk-tag sk-tag-mute">
                    <Icon name="car" className="h-3 w-3" />차량 {filteredPlaces[idx + 1].p.travelDurationMin}분
                  </span>
                  <span aria-hidden className="h-px flex-1 border-t border-dashed border-[var(--sk-line)]" />
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
          {/* 버튼까지 한 줄이라 여기서 잘리면 안 된다 — 문구를 버튼 폭에 맞게 줄였다 */}
          <span className="flex-1 truncate text-[13px] text-ink-soft">다른 분위기로 찾아볼까요?</span>
          <button
            onClick={requestAnotherInChat}
            className="sk sk-primary shrink-0 whitespace-nowrap px-4 py-2 text-[13px]"
          >
            다른 곳 추천
          </button>
        </div>
        )}
      </div>
    </>
  );
}
