"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  fetchWeather,
  fetchAirQuality,
  fetchSavedPlaces,
  putPlannedVisit,
  type PlaceWithMeta,
} from "@/lib/clientApi";
import { splitHeadline } from "@/lib/textFormat";
import { useAppStore } from "@/lib/store";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { KakaoMap } from "@/components/KakaoMap";
import { RecommendationSources } from "@/components/RecommendationSources";
import { buildSharePlanText } from "@/lib/share-plan";

// 실시간 방문자 리뷰(⭐ 평점, 리뷰 텍스트)는 이번 스코프에 없음 — 팀 자체 조사 결과
// (docs/research/place-reviews-and-mood-data-sources.md) 무료로 실제 데이터를 받을 수
// 있는 API가 없어서(카카오/네이버/TourAPI 다 평점·리뷰 필드 자체가 없고, 구글 Places만
// 있지만 유료) 지어내지 않고 생략함. 리뷰 UI 디자인 자체도 아직 미확정이라고 전달받음 —
// 디자인 나오고 데이터 소스가 정해지면 그때 추가.

function airQualityPhrase(grade: string): string {
  if (grade === "좋음" || grade === "보통") return "외출하기 좋아요";
  return "외출을 자제하세요";
}

export function DetailScreen({ place, runId }: { place: PlaceWithMeta; runId: string | null }) {
  const { regionId } = useAppStore();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const [savePending, setSavePending] = useState(false);
  const [shareNotice, setShareNotice] = useState("");

  // 저장 여부를 로컬 state로만 들고 있으면 이미 저장한 장소를 다시 열었을 때 항상
  // "저장 안 됨"으로 보인다 — 서버 목록에서 파생시킨다. 방문 예정일도 여기서 같이 온다.
  const savedQuery = useQuery({
    queryKey: ["saved-places"],
    queryFn: () => fetchSavedPlaces(),
    enabled: !!session,
  });
  const savedEntry = savedQuery.data?.find((s) => s.placeId === place.placeId) ?? null;
  const saved = !!savedEntry;

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

  const p = place;

  const { headline: reasonHeadline, body: reasonBody } = splitHeadline(p.reason ?? "");
  const isIndoor = p.tags?.includes("실내");
  const isOutdoor = p.tags?.includes("야외");

  async function toggleSave() {
    if (!session) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!p.placeId) return;

    setSavePending(true);
    const wasSaved = saved;
    try {
      if (wasSaved) {
        await fetch(`/api/saved-places?placeId=${encodeURIComponent(p.placeId)}`, { method: "DELETE" });
      } else {
        await fetch("/api/saved-places", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placeId: p.placeId }),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["saved-places"] });
    } finally {
      setSavePending(false);
    }
  }

  async function changePlannedVisit(date: string | null) {
    if (!place.placeId) return;
    setSavePending(true);
    try {
      await putPlannedVisit(place.placeId, date);
      queryClient.invalidateQueries({ queryKey: ["saved-places"] });
    } finally {
      setSavePending(false);
    }
  }

  async function share() {
    const text = buildSharePlanText({ needsMoreInfo: false, message: p.oneLineDescription, places: [p] }, p.name);
    try {
      if (navigator.share) await navigator.share({ title: p.name, text });
      else { await navigator.clipboard.writeText(text); setShareNotice("장소 정보를 복사했습니다."); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setShareNotice("공유하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  return (
    <>
      {shareNotice && <p role="status" className="px-5 pt-2 text-sm text-muted">{shareNotice}</p>}
      <ScreenHeader
        title="상세 보기"
        onBack={() => router.push(runId ? `/recommend/${runId}` : "/")}
        right={
          <div className="flex items-center gap-3">
            {(
              <button onClick={share} aria-label="공유하기" className="text-ink-soft">
                <Icon name="share" className="h-5 w-5" />
              </button>
            )}
            <button
              onClick={toggleSave}
              disabled={savePending || (!!session && !p.placeId)}
              aria-label="찜하기"
              className={saved ? "text-rose-500" : "text-ink-soft"}
            >
              <Icon name="heart" className={`h-5 w-5 ${saved ? "fill-rose-500" : ""}`} />
            </button>
          </div>
        }
      />
      <div className="flex flex-col gap-3 px-5">
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 외부 공공데이터 이미지, 도메인 사전등록 불필요한 일반 img로 처리
          <img src={p.imageUrl} alt={p.name} className="h-48 w-full rounded-2xl object-cover" />
        ) : (
          <div className="flex h-48 w-full items-center justify-center rounded-2xl bg-mint-soft">
            <Icon name="pin" className="h-10 w-10 text-mint-mid" />
          </div>
        )}

        <div>
          <h2 className="text-[22px] font-bold text-ink">{p.name}</h2>
          {(p.category || p.daeguDistrict) && (
            <p className="mt-1 text-[13px] text-muted">
              {[p.category, p.daeguDistrict ? `대구 ${p.daeguDistrict}` : null].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        {(p.tags && p.tags.length > 0) || p.visitDuration ? (
          <div className="flex flex-wrap gap-2">
            {p.tags?.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-full border border-hairline bg-white px-3 py-1.5 text-[12px] font-medium text-ink-soft"
              >
                {tag}
              </span>
            ))}
            {p.visitDuration && (
              <span className="flex items-center gap-1 rounded-full border border-hairline bg-white px-3 py-1.5 text-[12px] font-medium text-ink-soft">
                <Icon name="clock" className="h-3.5 w-3.5" />
                {p.visitDuration}
              </span>
            )}
          </div>
        ) : null}

        <RecommendationSources sources={p.sources} verification={p.verification} closedDays={p.closedDays} />
        {p.reason && (
          <div className="rounded-2xl border border-accent/30 bg-mint-bg px-4 py-3.5">
            <div className="flex gap-2">
              <Icon name="sparkle" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-accent" />
              <div className="flex flex-col gap-1.5">
                <p className="text-[15px] font-bold leading-snug text-ink">왜 추천했나요?</p>
                <p className="text-[13px] leading-relaxed text-ink-soft">{reasonHeadline}</p>
                {reasonBody && <p className="text-[13px] leading-relaxed text-muted">{reasonBody}</p>}
              </div>
            </div>
          </div>
        )}

        {(weatherQuery.data || airQualityQuery.data) && (
          <div>
            <h3 className="px-1 pb-2 text-[13px] font-semibold text-muted">오늘의 환경 정보</h3>
            <div className="grid grid-cols-3 gap-2">
              {weatherQuery.data && (
                <div className="flex flex-col items-center gap-1 rounded-2xl bg-white px-2 py-3 text-center shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
                  <Icon name="sun" className="h-5 w-5 text-amber-400" />
                  <span className="text-[14px] font-bold text-ink">
                    {weatherQuery.data.temperatureC !== null ? `${weatherQuery.data.temperatureC}°C` : "-"}
                  </span>
                  <span className="text-[11px] text-muted">{weatherQuery.data.summary}</span>
                </div>
              )}
              {airQualityQuery.data && (
                <div className="flex flex-col items-center gap-1 rounded-2xl bg-white px-2 py-3 text-center shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
                  <Icon name="dust" className="h-5 w-5 text-mint-mid" />
                  <span className="text-[14px] font-bold text-accent">{airQualityQuery.data.overallGrade}</span>
                  <span className="text-[11px] text-muted">{airQualityPhrase(airQualityQuery.data.overallGrade)}</span>
                </div>
              )}
              {(isIndoor || isOutdoor) && (
                <div className="flex flex-col items-center gap-1 rounded-2xl bg-white px-2 py-3 text-center shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
                  <Icon name={isIndoor ? "home" : "sun"} className="h-5 w-5 text-mint-mid" />
                  <span className="text-[14px] font-bold text-ink">{isIndoor ? "실내 추천" : "실외 추천"}</span>
                  <span className="text-[11px] text-muted">
                    {isIndoor ? "쾌적한 실내 공간" : "탁 트인 야외 공간"}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 네 항목이 전부 비면 카드 자체를 숨긴다 — 장소 검색으로 들어온 장소는 주소조차
            없는 경우가 있어(카카오가 road_address를 안 주는 지명 등) 빈 흰 박스만 남았다. */}
        {(p.address || p.operatingHours || p.fee || p.suggestedRoute) && (
        <div className="flex flex-col gap-2.5 rounded-2xl bg-white px-4 py-4 text-[14px] shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
          {p.address && (
            <div className="flex gap-2">
              <Icon name="pin" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
              <span className="text-ink-soft">{p.address}</span>
            </div>
          )}
          {p.operatingHours && (
            <div className="flex gap-2">
              <Icon name="clock" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
              <span className="text-ink-soft">{p.operatingHours}</span>
            </div>
          )}
          {p.fee && (
            <div className="flex gap-2">
              <Icon name="bookmark" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
              <span className="text-ink-soft">{p.fee}</span>
            </div>
          )}
          {p.suggestedRoute && (
            <div className="flex gap-2">
              <Icon name="compass" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mint-mid" />
              <span className="text-ink-soft">{p.suggestedRoute}</span>
            </div>
          )}
        </div>
        )}

        {p.features && p.features.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {p.features.map((f, i) => (
              <span key={i} className="rounded-full bg-mint-bg px-3 py-1.5 text-[13px] font-medium text-accent">
                {f}
              </span>
            ))}
          </div>
        )}

        {p.latitude !== null && p.latitude !== undefined && p.longitude !== null && p.longitude !== undefined && (
          <KakaoMap
            center={{ latitude: p.latitude, longitude: p.longitude }}
            destinationLabel={p.name}
            spots={[]}
          />
        )}

        <div className="mt-1 flex gap-2">
          <button
            onClick={toggleSave}
            disabled={savePending || (!!session && !p.placeId)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full border py-3 text-[14px] font-semibold ${
              saved ? "border-rose-200 bg-rose-50 text-rose-500" : "border-hairline text-ink-soft"
            } disabled:opacity-50`}
          >
            <Icon name="heart" className={`h-4 w-4 ${saved ? "fill-rose-500" : ""}`} />
            {saved ? "저장됨" : "이 장소 저장"}
          </button>
          {p.daeguDistrict && p.placeId && (
            <button
              onClick={() =>
                router.push(
                  runId ? `/recommend/${runId}/place/${p.placeId}/parking` : `/place/${p.placeId}/parking`
                )
              }
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent py-3 text-[14px] font-semibold text-white"
            >
              <Icon name="parking" className="h-4 w-4" />
              주차 정보 보기
            </button>
          )}
        </div>

        {/* 방문 예정일은 저장한 장소에만 붙는다(저장이 선행 조건) — 날짜 입력은 브라우저
            기본 date 피커를 그대로 쓴다. 라이브러리 없이 모바일에선 네이티브 달력이 뜬다. */}
        {saved && (
          <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
            <Icon name="clock" className="h-[18px] w-[18px] shrink-0 text-mint-mid" />
            <label htmlFor="planned-visit" className="text-[14px] text-ink-soft">
              방문 예정일
            </label>
            <input
              id="planned-visit"
              type="date"
              value={savedEntry?.plannedVisitAt ?? ""}
              disabled={savePending}
              onChange={(e) => changePlannedVisit(e.target.value === "" ? null : e.target.value)}
              className="ml-auto rounded-full bg-mint-bg px-3 py-1.5 text-[13px] text-ink outline-none disabled:opacity-50"
            />
            {savedEntry?.plannedVisitAt && (
              <button
                onClick={() => changePlannedVisit(null)}
                disabled={savePending}
                className="shrink-0 text-[12px] font-semibold text-muted disabled:opacity-50"
              >
                해제
              </button>
            )}
          </div>
        )}

        {p.placeId && p.latitude !== null && p.latitude !== undefined && p.longitude !== null && p.longitude !== undefined && (
          <button
            onClick={() =>
              router.push(runId ? `/recommend/${runId}/place/${p.placeId}/transit` : `/place/${p.placeId}/transit`)
            }
            className="flex items-center justify-center gap-1.5 rounded-full border border-hairline py-3 text-[14px] font-semibold text-ink-soft"
          >
            <Icon name="bus" className="h-4 w-4" />
            대중교통 길찾기
          </button>
        )}
      </div>
    </>
  );
}
