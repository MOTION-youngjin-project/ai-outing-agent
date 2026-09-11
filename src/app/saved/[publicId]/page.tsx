"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchSavedCourse } from "@/lib/clientApi";
import { CourseMapView } from "@/components/CourseMapView";
import { ScreenHeader } from "@/components/ScreenHeader";

// "코스 다시 보기" — 저장 시점 스냅샷으로 지도+정류지 목록을 그린다. 추천 런(runId)에
// 매이지 않으므로 정류지 링크는 단독 장소 상세(/place/[placeId])로 간다.
export default function SavedCoursePage() {
  const { publicId } = useParams<{ publicId: string }>();
  const router = useRouter();
  const query = useQuery({
    queryKey: ["saved-course", publicId],
    queryFn: () => fetchSavedCourse(publicId),
  });

  if (query.isLoading) {
    return <p className="px-5 py-10 text-center text-[14px] text-muted">불러오는 중...</p>;
  }
  if (query.isError || !query.data) {
    return <p className="px-5 py-10 text-center text-[14px] text-muted">저장한 코스를 찾을 수 없습니다.</p>;
  }

  const saved = query.data;
  return (
    <>
      <ScreenHeader title={saved.title} onBack={() => router.push("/saved")} />
      <div className="flex flex-col gap-3 px-5">
        <CourseMapView places={saved.course.places ?? []} runId={null} cacheKey={saved.publicId} />
      </div>
    </>
  );
}
