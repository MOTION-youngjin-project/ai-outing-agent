import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { PlaceWithMeta } from "@/lib/clientApi";
import { WALK_DISTANCE_THRESHOLD_M, estimateWalkMinutes } from "@/lib/travelMode";

// 코스 정류지를 번호+점선 타임라인으로 보여주는 목록 — CourseCard(채팅 인라인 카드)와
// MapScreen(지도 탭) 둘 다 같은 구성을 쓴다(디자인/채팅.png, 디자인/지도.png).
export function CourseStopList({ places, runId }: { places: PlaceWithMeta[]; runId: string }) {
  return (
    <div className="flex flex-col">
      {places.map((p, i) => {
        const content = (
          <>
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- 외부 공공데이터 이미지, 도메인 사전등록 불필요한 일반 img로 처리
              <img src={p.imageUrl} alt={p.name} className="h-16 w-16 shrink-0 rounded-xl object-cover" />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-mint-soft">
                <Icon name="pin" className="h-6 w-6 text-mint-mid" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-bold text-ink">{p.name}</div>
              <div className="mt-0.5 line-clamp-1 text-[12px] text-muted">{p.oneLineDescription}</div>
              {(p.visitDuration || p.fee) && (
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted/80">
                  {p.visitDuration && <span>{p.visitDuration}</span>}
                  {p.fee && <span>{p.fee}</span>}
                </div>
              )}
            </div>
          </>
        );

        return (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mint-soft text-[11px] font-bold text-mint-mid">
                {i + 1}
              </span>
              {i < places.length - 1 && (
                <div className="flex flex-1 flex-col items-center gap-1">
                  <span className="w-px flex-1 border-l border-dashed border-hairline" />
                  {places[i + 1].travelDurationMin != null && places[i + 1].travelDistanceM != null && (
                    <span className="flex items-center gap-1 whitespace-nowrap text-[10px] font-medium text-muted">
                      {places[i + 1].travelDistanceM! < WALK_DISTANCE_THRESHOLD_M ? (
                        <>
                          <Icon name="walk" className="h-3 w-3" />
                          도보 {estimateWalkMinutes(places[i + 1].travelDistanceM!)}분
                        </>
                      ) : (
                        <>
                          <Icon name="car" className="h-3 w-3" />
                          차량 {places[i + 1].travelDurationMin}분
                        </>
                      )}
                    </span>
                  )}
                  <span className="w-px flex-1 border-l border-dashed border-hairline" />
                </div>
              )}
            </div>
            {p.placeId ? (
              <Link href={`/recommend/${runId}/place/${p.placeId}`} className="flex flex-1 gap-3 pb-4">
                {content}
              </Link>
            ) : (
              <div className="flex flex-1 gap-3 pb-4">{content}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
