"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Icon } from "@/components/Icon";
import { ExternalMapMenu } from "@/components/ExternalMapMenu";
import { CourseStopList } from "@/components/CourseStopList";
import { postSavedCourse, type RecommendResult, type WeatherInfo, type AirQualityInfo } from "@/lib/clientApi";

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
  const queryClient = useQueryClient();
  const places = recommendation.places ?? [];
  const allTags = Array.from(new Set(places.flatMap((p) => p.tags ?? [])));
  const [saved, setSaved] = useState(false);

  // 저장한 코스(saved_courses)로 담는다 — 서버가 runId로 코스 내용을 스냅샷해서 넣으므로
  // 여기선 어떤 추천인지만 넘긴다. 같은 코스를 두 번 눌러도 행이 하나만 생긴다(upsert).
  const saveCourseMutation = useMutation({
    mutationFn: () => postSavedCourse(recommendation.agentRunId),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["saved-courses"] });
    },
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

  // 결과를 무조건 "오늘의 추천 코스"라고 부르지 않는다. 실제 데이터로 판별한다.
  //  - 구간 이동시간(네이버 Directions로 채워지는 travelDurationMin)이 있으면
  //    순서대로 돌아보는 "코스"다.
  //  - 없으면 그냥 조건에 맞는 "장소 목록"이고, 한 곳뿐이면 "장소"다.
  // (질문 의도 자체를 구분하는 건 에이전트 쪽 일이라 여기선 건드리지 않는다.
  //  다만 UI가 아닌 것을 코스라고 부르지는 않게 한다.)
  const isCourse = places.some((p, i) => i > 0 && p.travelDurationMin != null);
  const title = isCourse ? "오늘의 추천 코스" : places.length > 1 ? "추천 장소" : "추천한 곳";
  const subline = isCourse
    ? `${places.length}곳을 순서대로 둘러보는 코스예요.`
    : places.length > 1
      ? `조건에 맞는 장소 ${places.length}곳이에요.`
      : null;
  const detailLabel = isCourse ? "코스 상세" : "목록 상세";
  const saveLabel = isCourse ? "코스 저장" : "저장";
  const goLabel = isCourse ? "이 코스로 출발" : "길찾기";

  return (
    // 카드 안이 한꺼번에 나타나지 않는다 — 제목 → 환경 정보 → 요약 → 장소 목록
    // → 태그 → 액션 순서로 40ms 간격을 두고 도착한다(sk-stagger).
    <div className="sk-panel sk-enter sk-stagger p-4">
      <h3 className="sk-cap text-[15px] font-bold text-ink">{title}</h3>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {regionName && (
          <span className="sk-tag sk-tag-mute text-ink-soft">
            <Icon name="pin" className="h-3 w-3 text-accent" />
            {regionName}
          </span>
        )}
        {airQuality && (
          <span className="sk-tag sk-tag-mute text-ink-soft">
            <Icon name="dust" className="h-3 w-3 text-mint-mid" />
            미세먼지 {airQuality.overallGrade}
          </span>
        )}
        {weather && (
          <span className="sk-tag sk-tag-mute text-ink-soft">
            <Icon name="sun" className="h-3 w-3 text-amber-400" />
            {weather.temperatureC !== null ? `${weather.temperatureC}°C` : weather.summary}
          </span>
        )}
      </div>

      {subline && <p className="mt-2 text-[12px] text-muted">{subline}</p>}

      <div className="mt-3">
        <CourseStopList places={places} runId={recommendation.agentRunId} ordered={isCourse} late />
      </div>

      {allTags.length > 0 && (
        <div className="sk-stagger flex flex-wrap gap-1.5 border-t border-[var(--sk-line-soft)] pt-3">
          {allTags.map((t) => (
            <span key={t} className="sk-tag">
              {t}
            </span>
          ))}
        </div>
      )}

      {/* 액션 — 셋을 한 줄에 욱여넣으니 글자가 버튼에 꽉 찼다.
          핵심 액션을 전폭 한 줄로 올리고 보조 둘은 같은 너비 그리드로 맞춘다. */}
      <div className="mt-4 flex flex-col gap-2">
        {hasStartCoords ? (
          <ExternalMapMenu
            latitude={firstPlace.latitude!}
            longitude={firstPlace.longitude!}
            name={firstPlace.name}
            label={goLabel}
            icon="arrowUpRight"
            popupAbove
            summaryClassName="sk sk-primary flex list-none items-center justify-center gap-1.5 px-4 py-3 text-[13px] marker:content-none"
          />
        ) : (
          <button
            disabled
            className="sk flex w-full items-center justify-center gap-1.5 px-4 py-3 text-[13px] font-semibold"
          >
            <Icon name="arrowUpRight" className="h-4 w-4" />
            {goLabel}
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onOpenDetail}
            className="sk flex items-center justify-center gap-1.5 px-3 py-2.5 text-[12px] font-semibold text-ink-soft"
          >
            <Icon name="menu" className="h-3.5 w-3.5" />
            {detailLabel}
          </button>
          <button
            onClick={saveCourse}
            disabled={places.length === 0 || saveCourseMutation.isPending || saved}
            className={`sk flex items-center justify-center gap-1.5 px-3 py-2.5 text-[12px] font-semibold ${saved ? "sk-on" : "text-ink-soft"}`}
          >
            <Icon name={saved ? "check" : "checkCircle"} className="h-3.5 w-3.5" />
            {saved ? "저장됨" : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
