"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { fetchRegions, fetchWeather, fetchAirQuality, fetchParking, type RecommendResult, type PlaceWithMeta } from "@/lib/clientApi";
import { occupancyLabel } from "@/lib/parkingDisplay";
import { splitHeadline } from "@/lib/textFormat";
import { FILTER_LABELS } from "@/lib/placeTags";
import { useAppStore } from "@/lib/store";
import { Icon } from "@/components/Icon";
import { SidebarToggleButton } from "@/components/SidebarToggleButton";

// 결과 화면에서 조건을 더 추가하고 싶을 때 누르는 정적 문구 칩 — 실시간 재요청 없이
// 홈으로 이동해 그 문구를 입력창에 채워준다(아래 QUICK_REFINEMENTS 참고).
const QUICK_REFINEMENTS = ["주차 포함", "더 저렴하게", "실내 위주로"] as const;

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
  const { regionId, history, setInput } = useAppStore();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();

  // 새로고침/직링크로 들어오면 history가 비어있다 — 그럴 땐 지어내지 말고 사용자 버블을 생략한다.
  const lastUserMessage = [...history].reverse().find((t) => t.role === "user")?.content ?? null;

  // 조건 추가/퀵필터는 결과 화면 안에서 바로 재요청하지 않고 홈으로 이동해 입력창에 문구를
  // 채워준다. ponytail: 결과 화면 내 인라인 재요청 대신 홈으로 이동, 실시간 갱신은 다음 스코프.
  const [refineInput, setRefineInput] = useState("");
  function goRefine(text: string) {
    setInput(text);
    router.push("/");
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
  const regionsQuery = useQuery({ queryKey: ["regions", "sido"], queryFn: fetchRegions });
  const regionName = (regionsQuery.data ?? []).find((r) => r.id === regionId)?.name ?? "";

  // 찜 아이콘 — 로그인 상태면 /api/saved-places로 실제 저장까지 한다(로그아웃 상태면
  // 로그인 화면으로 유도).
  const [favoriteIndexes, setFavoriteIndexes] = useState<Set<number>>(new Set());
  // null = "전체" 선택 상태. 결과 카드의 tags 필드와 매칭해서 필터링한다.
  const [activeFilter, setActiveFilter] = useState<(typeof FILTER_LABELS)[number] | null>(null);
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
    .filter(({ p }) => !activeFilter || p.tags?.includes(activeFilter));

  function openDetail(place: PlaceWithMeta) {
    if (!place.placeId) return;
    router.push(`/recommend/${runId}/place/${place.placeId}`);
  }

  function viewParkingFor(place: PlaceWithMeta) {
    if (!place.daeguDistrict || !place.placeId) return;
    router.push(`/recommend/${runId}/place/${place.placeId}/parking`);
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
        <button
          onClick={() => router.push("/")}
          aria-label="새 질문"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink shadow-[0_1px_3px_rgba(17,24,39,0.05)]"
        >
          <Icon name="plus" className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-3 px-5 pt-3">
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

        {lastUserMessage && (
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-accent px-4 py-2.5 text-[14px] text-white">
              {lastUserMessage}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 px-1 text-[12px] font-semibold text-accent">
          <Icon name="sparkle" className="h-3.5 w-3.5" />
          AI 추천
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
        {/* ponytail: 정류지 간 이동시간(자동차)은 네이버 Directions로 채워서 카드 사이에
            표시함. 코스 합산 시간/비용은 여전히 API 미제공이라 비워둠. */}

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveFilter(null)}
            className={
              activeFilter === null
                ? "flex shrink-0 items-center gap-1.5 rounded-full border border-accent bg-white px-3.5 py-1.5 text-[13px] font-semibold text-accent"
                : "shrink-0 rounded-full border border-hairline bg-white px-3.5 py-1.5 text-[13px] text-muted"
            }
          >
            {activeFilter === null && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
            전체
          </button>
          {FILTER_LABELS.map((label) => (
            <button
              key={label}
              onClick={() => setActiveFilter(activeFilter === label ? null : label)}
              className={
                activeFilter === label
                  ? "flex shrink-0 items-center gap-1.5 rounded-full border border-accent bg-white px-3.5 py-1.5 text-[13px] font-semibold text-accent"
                  : "shrink-0 rounded-full border border-hairline bg-white px-3.5 py-1.5 text-[13px] text-muted"
              }
            >
              {activeFilter === label && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
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
              className="flex overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(17,24,39,0.06)]"
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
                {p.tags?.[0] && (
                  <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">
                    {p.tags[0]} 추천
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
                  <button
                    onClick={() => toggleFavorite(p, i)}
                    disabled={!!session && !p.placeId}
                    title={session && !p.placeId ? "저장할 수 없는 장소입니다" : undefined}
                    aria-label="찜하기"
                    className={
                      favoriteIndexes.has(i)
                        ? "text-rose-500"
                        : session && !p.placeId
                          ? "text-slate-200"
                          : "text-slate-300"
                    }
                  >
                    <Icon
                      name="heart"
                      className={`h-5 w-5 ${favoriteIndexes.has(i) ? "fill-rose-500" : ""}`}
                    />
                  </button>
                </div>
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
                    className="flex-1 rounded-full border border-hairline py-1.5 text-[12px] font-medium text-ink-soft disabled:opacity-50"
                  >
                    상세 보기
                  </button>
                  <button
                    onClick={() => viewParkingFor(p)}
                    disabled={!p.daeguDistrict || !p.placeId}
                    className="flex-1 rounded-full bg-mint-bg py-1.5 text-[12px] font-semibold text-accent disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    주차 정보
                  </button>
                </div>
              </div>
            </div>
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

        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {QUICK_REFINEMENTS.map((label) => (
            <button
              key={label}
              onClick={() => goRefine(label)}
              className="shrink-0 rounded-full border border-hairline bg-white px-3.5 py-1.5 text-[13px] text-ink-soft"
            >
              {label}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const text = refineInput.trim();
            if (text) goRefine(text);
          }}
          className="flex items-center gap-2 rounded-full bg-white p-1.5 pl-4 shadow-[0_1px_4px_rgba(17,24,39,0.07)]"
        >
          <input
            value={refineInput}
            onChange={(e) => setRefineInput(e.target.value)}
            placeholder="조건을 추가하거나 다른 코스를 물어보세요"
            className="flex-1 bg-transparent py-2 text-[14px] text-ink outline-none placeholder:text-muted/60"
          />
          <button
            type="submit"
            disabled={!refineInput.trim()}
            aria-label="보내기"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:bg-slate-200 disabled:text-slate-400"
          >
            <Icon name="send" className="h-[18px] w-[18px]" />
          </button>
        </form>
      </div>
    </>
  );
}
