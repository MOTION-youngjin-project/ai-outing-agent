"use client";

import { useRouter } from "next/navigation";
import type { RecommendResult } from "@/lib/clientApi";
import { CourseMapView } from "@/components/CourseMapView";
import { Icon } from "@/components/Icon";
import { SidebarToggleButton } from "@/components/SidebarToggleButton";

// 디자인/지도.png: 코스 전체를 지도 위 번호 핀+구간별 폴리라인으로 보여주고, 그 아래
// 기존 코스 리스트(CourseStopList)를 그대로 이어붙인다. 총 소요시간/예상비용
// 요약바는 백엔드에 합산 필드가 없어(장소별 자유텍스트뿐) 넣지 않는다 — 지어내지 않는다.
export function MapScreen({ recommendation, runId }: { recommendation: RecommendResult; runId: string }) {
  const router = useRouter();

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
      <div className="flex flex-col gap-3 px-5">
        <CourseMapView
          places={recommendation.places ?? []}
          runId={runId}
          cacheKey={runId}
          listHeading="오늘의 추천 코스"
        />
      </div>
    </>
  );
}
