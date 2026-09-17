import Link from "next/link";
import { PhotoPreferenceEditor } from "@/components/PhotoPreferenceEditor";
import { PhotoPlaceCatalog } from "@/components/PhotoPlaceCatalog";
import { PhotoCoursePlanner } from "@/components/PhotoCoursePlanner";
import { PHOTO_PLACES } from "@/lib/data/daegu-photo-places";

export default function PhotoPage() {
  return <main className="px-5 py-5 text-ink">
    <Link href="/" className="text-sm underline">여행 추천으로 돌아가기</Link>
    <h1 className="mt-4 text-xl font-bold">어떤 사진을 찍고 싶으세요?</h1>
    <p className="mt-2 text-sm">원하는 배경이나 분위기의 참고 사진을 선택해 보세요.</p>
    <PhotoPreferenceEditor />
    <PhotoCoursePlanner origins={PHOTO_PLACES.map(({ id, name }) => ({ id, name }))} />
    <PhotoPlaceCatalog />
  </main>;
}
