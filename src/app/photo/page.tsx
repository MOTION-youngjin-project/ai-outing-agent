"use client";

import { ScreenHeader } from "@/components/ScreenHeader";
import { PhotoPreferenceEditor } from "@/components/PhotoPreferenceEditor";
import { PhotoPlaceCatalog } from "@/components/PhotoPlaceCatalog";
import { PhotoCoursePlanner } from "@/components/PhotoCoursePlanner";
import { PHOTO_PLACES } from "@/lib/data/daegu-photo-places";
import { useBack } from "@/lib/useBack";

export default function PhotoPage() {
  const goBack = useBack("/");
  return <>
    <ScreenHeader title="포토 코스" onBack={goBack} />
    <main className="flex flex-col gap-4 px-5 pb-6 text-ink">
      <div className="sk-enter">
        <p className="text-[20px] font-bold leading-snug text-ink">어떤 사진을 찍고 싶으세요?</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">원하는 배경이나 분위기의 참고 사진을 고르면, 그 취향에 맞춰 대구 촬영 코스를 짜드려요.</p>
      </div>
      <PhotoPreferenceEditor />
      <PhotoCoursePlanner origins={PHOTO_PLACES.map(({ id, name }) => ({ id, name }))} />
      <PhotoPlaceCatalog />
    </main>
  </>;
}
