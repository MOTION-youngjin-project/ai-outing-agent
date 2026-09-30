"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchWeather, fetchAirQuality, fetchRegions, type RecommendResult } from "@/lib/clientApi";
import { shortRegionName } from "@/lib/services/matching";
import { CourseMapView } from "@/components/CourseMapView";
import { Icon } from "@/components/Icon";
import { SidebarToggleButton } from "@/components/SidebarToggleButton";
import { useAppStore } from "@/lib/store";

// 디자인/지도.png: 코스 전체를 지도 위 번호 핀+구간별 폴리라인으로 보여주고, 그 아래
// 기존 코스 리스트(CourseStopList)를 그대로 이어붙인다. 총 소요시간/예상비용
// 요약바는 백엔드에 합산 필드가 없어(장소별 자유텍스트뿐) 넣지 않는다 — 지어내지 않는다.
export function MapScreen({ recommendation, runId }: { recommendation: RecommendResult; runId: string }) {
  const router = useRouter();
  const regionId = useAppStore((s) => s.regionId);

  const regionsQuery = useQuery({ queryKey: ["regions"], queryFn: fetchRegions });
  const regionName = regionsQuery.data?.find((r) => r.id === regionId)?.name;
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

  return (
    <>
      {/* 오른쪽은 "새 질문(+)"이 아니라 "채팅으로 돌아가기"다 — 지도는 챗에서 만든
          코스를 펼쳐 보는 곳이라, 여기서 필요한 건 새로 시작이 아니라 원래 대화로
          돌아가는 길이다. 스토어(history)를 건드리지 않고 홈으로만 가므로 하던
          대화가 그대로 이어진다. */}
      <div className="sk-bar">
        <SidebarToggleButton />
        <h1 className="text-[17px] font-bold text-ink">오늘의 코스 지도</h1>
        <button
          onClick={() => router.push("/")}
          aria-label="채팅으로 돌아가기"
          className="sk sk-slot h-9 w-9 bg-white text-ink"
        >
          <Icon name="chat" className="h-[18px] w-[18px]" />
        </button>
      </div>
      <div className="flex flex-col gap-3 px-5 pb-2">
        {(regionName || weatherQuery.data || airQualityQuery.data) && (
          // 다른 화면의 환경 정보 줄과 같은 조형(sk-panel)으로 맞춘다 — 여기만
          // 옛날 흰 카드라 지도 탭에 들어오면 다른 앱처럼 보였다.
          <div className="sk-panel sk-reel sk-enter items-center gap-4 px-4 py-3 text-[13px]">
            {regionName && (
              <span className="flex shrink-0 items-center gap-1.5">
                <Icon name="pin" className="h-[18px] w-[18px] text-accent" />
                <span className="font-medium text-ink-soft">{shortRegionName(regionName)}</span>
              </span>
            )}
            {airQualityQuery.data && (
              <span className="flex shrink-0 items-center gap-1.5">
                <Icon name="dust" className="h-[18px] w-[18px] text-mint-mid" />
                <span className="text-muted">미세먼지</span>
                <span className="font-semibold text-accent">{airQualityQuery.data.overallGrade}</span>
              </span>
            )}
            {weatherQuery.data && (
              <span className="flex shrink-0 items-center gap-1.5">
                <Icon name="sun" className="h-[18px] w-[18px] text-amber-400" />
                <span className="font-medium text-ink-soft">
                  {weatherQuery.data.temperatureC !== null ? `${weatherQuery.data.temperatureC}°C · ` : ""}
                  {weatherQuery.data.summary}
                </span>
              </span>
            )}
          </div>
        )}
        <div className="sk-enter flex flex-col gap-3">
          <CourseMapView
            places={recommendation.places ?? []}
            runId={runId}
            cacheKey={runId}
            listHeading="오늘의 추천 코스"
          />
        </div>
      </div>
    </>
  );
}
