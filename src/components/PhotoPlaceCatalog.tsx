import { PHOTO_PLACES } from "@/lib/data/daegu-photo-places";
import { PHOTO_CATALOG_NOTICE, PHOTO_TIME_LABELS } from "@/lib/photo-places";

export function PhotoPlaceCatalog() {
  return <section aria-label="대구 촬영 장소" className="mt-6 space-y-3">
    <h2 className="text-lg font-semibold">대구 촬영 장소 {PHOTO_PLACES.length}곳</h2>
    <p className="text-sm">원하는 사진을 떠올리며 장소를 살펴보세요. 확정한 취향으로 위에서 코스를 만들 수 있습니다.</p>
    <p className="text-xs text-muted">{PHOTO_CATALOG_NOTICE}</p>
    {PHOTO_PLACES.map((place) => <details key={place.id} className="rounded-xl border border-accent/30 bg-white p-4">
      <summary className="cursor-pointer font-medium">{place.name} · {place.environment === "indoor" ? "실내 · 촬영 허용 확인 필요" : "야외"}</summary>
      <div className="mt-3 space-y-2 text-sm">
        <p>{place.address}</p><p>{place.shootingArea}</p>
        <p>촬영 분위기: {place.tags.join(" · ")}</p>
        <p>추천 시간대: {place.suggestedTimes.map((time) => PHOTO_TIME_LABELS[time]).join(" · ")} · 제안 체류 시간 {place.estimatedVisitMinutes}분</p>
        <p>운영 안내: {place.hours}</p><p>휴무 안내: {place.closures}</p>
        <ul className="list-disc space-y-1 pl-5">{place.shootingTips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
        <p>{place.visitNotice}</p>
        <p className="text-xs text-muted">정보 확인일: {place.checkedAt}</p>
        <div className="flex flex-wrap gap-3">{place.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="text-xs underline">{source.label}</a>)}</div>
      </div>
    </details>)}
  </section>;
}
