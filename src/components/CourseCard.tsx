"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Icon } from "@/components/Icon";
import { ExternalMapMenu } from "@/components/ExternalMapMenu";
import { CourseStopList } from "@/components/CourseStopList";
import type { RecommendResult, WeatherInfo, AirQualityInfo } from "@/lib/clientApi";

// 디자인팀 목업(디자인/채팅.png)의 "오늘의 추천 코스" 카드. 목업은 장소별 정확한 방문
// 시각/코스 총 소요시간·총비용까지 보여주지만, 지금 agent.ts가 실제로 만들어주는
// 데이터엔 그런 필드가 없다. 이동수단·시간은 네이버 Directions로 구간별(자동차)
// travelDurationMin을 채워 연결선에 표시한다 — 지어내지 않는다는 이 프로젝트 원칙
// (agent.ts 시스템 프롬프트 "모르면 비워라")에 따라 값이 없는 구간은 표시하지 않는다.
export function CourseCard({
  recommendation,
  regionName,
  weather,
  airQuality,
  onOpenDetail,
}: {
  recommendation: RecommendResult;
  regionName?: string;
  weather?: WeatherInfo | null;
  airQuality?: AirQualityInfo | null;
  onOpenDetail: () => void;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const places = recommendation.places ?? [];
  const allTags = Array.from(new Set(places.flatMap((p) => p.tags ?? [])));
  const savablePlaceIds = places.map((p) => p.placeId).filter((id): id is string => !!id);
  const [saved, setSaved] = useState(false);

  // ponytail: "코스" 자체를 저장하는 스키마가 아직 없다 — 코스에 속한 장소들을 기존
  // SavedPlace로 한 번에 저장한다(각 POST는 upsert라 중복 호출해도 안전). 별도
  // RecommendationRoute 저장 개념이 필요해지면 그때 스키마부터 새로 설계.
  const saveCourseMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(
        savablePlaceIds.map((placeId) =>
          fetch("/api/saved-places", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ placeId }),
          })
        )
      );
    },
    onSuccess: () => setSaved(true),
  });

  function saveCourse() {
    if (!session) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    saveCourseMutation.mutate();
  }

  const firstPlace = places[0];
  const hasStartCoords = firstPlace?.latitude != null && firstPlace?.longitude != null;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(17,24,39,0.06)]">
      <div className="flex flex-wrap items-center gap-1.5">
        <h3 className="mr-1 text-[15px] font-bold text-ink">오늘의 추천 코스</h3>
        {regionName && (
          <span className="flex items-center gap-1 rounded-full bg-page px-2.5 py-1 text-[11px] font-medium text-ink-soft">
            <Icon name="pin" className="h-3 w-3 text-accent" />
            {regionName}
          </span>
        )}
        {airQuality && (
          <span className="flex items-center gap-1 rounded-full bg-page px-2.5 py-1 text-[11px] font-medium text-ink-soft">
            <Icon name="dust" className="h-3 w-3 text-mint-mid" />
            미세먼지 {airQuality.overallGrade}
          </span>
        )}
        {weather && (
          <span className="flex items-center gap-1 rounded-full bg-page px-2.5 py-1 text-[11px] font-medium text-ink-soft">
            <Icon name="sun" className="h-3 w-3 text-amber-400" />
            {weather.temperatureC !== null ? `${weather.temperatureC}°C` : weather.summary}
          </span>
        )}
      </div>

      <p className="mt-2 text-[12px] text-muted">{places.length}곳을 둘러보는 코스예요.</p>

      <div className="mt-3">
        <CourseStopList places={places} runId={recommendation.agentRunId} />
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-hairline pt-3">
          {allTags.map((t) => (
            <span key={t} className="rounded-full bg-mint-bg px-2.5 py-1 text-[11px] font-medium text-accent">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-stretch gap-1.5">
        <button
          onClick={onOpenDetail}
          className="flex flex-1 items-center justify-center gap-1 rounded-full border border-hairline py-2.5 text-[12px] font-medium text-ink-soft"
        >
          <Icon name="compass" className="h-3.5 w-3.5" />
          코스 상세 보기
        </button>
        <button
          onClick={saveCourse}
          disabled={savablePlaceIds.length === 0 || saveCourseMutation.isPending || saved}
          className="flex flex-1 items-center justify-center gap-1 rounded-full bg-mint-bg py-2.5 text-[12px] font-semibold text-accent disabled:bg-slate-100 disabled:text-slate-400"
        >
          <Icon name={saved ? "check" : "bookmark"} className="h-3.5 w-3.5" />
          {saved ? "저장됨" : "코스 저장"}
        </button>
        {hasStartCoords ? (
          <ExternalMapMenu
            latitude={firstPlace.latitude!}
            longitude={firstPlace.longitude!}
            name={firstPlace.name}
            label="이 코스로 가기"
            popupAbove
            className="flex-1"
            summaryClassName="flex list-none items-center justify-center gap-1 rounded-full bg-accent py-2.5 text-[12px] font-semibold text-white marker:content-none"
          />
        ) : (
          <button
            disabled
            className="flex flex-1 items-center justify-center gap-1 rounded-full bg-slate-100 py-2.5 text-[12px] font-semibold text-slate-400"
          >
            <Icon name="send" className="h-3.5 w-3.5" />
            이 코스로 가기
          </button>
        )}
      </div>
    </div>
  );
}
