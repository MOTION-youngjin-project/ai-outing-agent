import { PlacePhoto } from "@/components/PlacePhoto";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { PlaceWithMeta } from "@/lib/clientApi";
import { WALK_DISTANCE_THRESHOLD_M, estimateWalkMinutes } from "@/lib/travelMode";
import { extractCategoryLabel } from "@/lib/services/matching";

// 코스 정류지를 번호+점선 타임라인으로 보여주는 목록 — CourseCard(채팅 인라인 카드),
// MapScreen(지도 탭), 저장한 코스 다시 보기가 같은 구성을 쓴다(디자인/채팅.png, 지도.png, 저장.png).
// runId가 null이면(저장한 코스: 추천 런이 이미 정리됐을 수 있음) 런에 매이지 않는
// 단독 장소 상세(/place/[placeId])로 보낸다.
//
// [정렬] 예전에는 왼쪽 레일 한 줄에 카테고리 태그 · 순번 · 이동시간을 세로로 쌓아서
// 레일이 넓어지고 순번이 장소 이름과 어긋났다. 이제 레일에는 순번과 점선만 두고,
// 카테고리·소요시간·요금은 장소 이름 아래 한 줄로 모으고, 이동시간은 정류지 사이의
// 자기 줄로 내린다(추천 결과 화면의 "차로 N분 이동"과 같은 방식).
// ordered=false면 순서가 없는 "조건에 맞는 장소 목록"이라 번호 대신 핀을 쓴다 —
// 코스가 아닌 결과에 1·2·3을 달면 없는 순서를 있는 것처럼 보이게 한다.
export function CourseStopList({
  places,
  runId,
  ordered = true,
  late = false,
}: {
  places: PlaceWithMeta[];
  runId: string | null;
  ordered?: boolean;
  // 카드 안에 들어갈 땐 바깥 구역(제목·환경 정보)이 자리 잡은 뒤 이어서 등장한다
  late?: boolean;
}) {
  return (
    <div className={`sk-stagger flex flex-col ${late ? "sk-stagger-late" : ""}`}>
      {places.map((p, i) => {
        const categoryLabel = extractCategoryLabel(p.category ?? null);
        const isLast = i === places.length - 1;
        const next = places[i + 1];
        const hasTravel = !isLast && next?.travelDurationMin != null && next?.travelDistanceM != null;
        const isWalk = hasTravel && next.travelDistanceM! < WALK_DISTANCE_THRESHOLD_M;

        const content = (
          <>

            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-bold leading-snug text-ink">{p.name}</div>
                  <div className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted">
                    {p.oneLineDescription}
                  </div>
                </div>
                <Icon name="next" className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
              </div>
              {/* 카테고리·머무는 시간·요금을 이름 아래 한 줄로 모은다 — 값이 있는 것만 뜬다 */}
              {(categoryLabel || p.visitDuration || p.fee) && (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {categoryLabel && <span className="sk-tag">{categoryLabel}</span>}
                  {p.visitDuration && <span className="sk-tag sk-tag-mute">{p.visitDuration}</span>}
                  {p.fee && <span className="sk-tag sk-tag-mute">{p.fee}</span>}
                </div>
              )}
            </div>
          </>
        );

        return (
          <div key={i} className="flex flex-col">
            {/* 정류지 한 칸 — 레일에는 번호(또는 핀)와 점선만 둔다 */}
            <div className="flex gap-3">
              <div className="flex w-7 shrink-0 flex-col items-center">
                {ordered ? (
                  <span className="sk-slot sk-slot-on h-7 w-7 text-[12px]">{i + 1}</span>
                ) : (
                  <span className="sk-slot h-7 w-7">
                    <Icon name="pin" className="h-3.5 w-3.5" />
                  </span>
                )}
                {!isLast && (
                  <span className="mt-1.5 w-px flex-1 border-l border-dashed border-[var(--sk-line)]" />
                )}
              </div>

              <div className="min-w-0 flex-1 pb-1 flex items-start gap-3"><PlacePhoto placeId={p.placeId} name={p.name} />
                {p.placeId ? (
                  <Link
                    href={runId ? `/recommend/${runId}/place/${p.placeId}` : `/place/${p.placeId}`}
                    className="flex gap-3"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex gap-3">{content}</div>
                )}
              </div>
            </div>

            {/* 이동 구간 — "이 장소의 정보"가 아니라 "다음 장소까지"이므로
                정류지 안이 아니라 사이에 자기 줄을 갖고, 레일의 점선도 이어진다.
                차량은 Directions 실측, 도보는 직선거리 추정이라 형태를 달리한다. */}
            {hasTravel && (
              <div className="flex gap-3">
                <div className="flex w-7 shrink-0 justify-center">
                  <span className="w-px border-l border-dashed border-[var(--sk-line)]" />
                </div>
                <div className="flex min-w-0 flex-1 items-center py-1.5">
                  {isWalk ? (
                    <span className="sk-tag sk-tag-est">
                      <Icon name="walk" className="h-3 w-3" />
                      도보 약 {estimateWalkMinutes(next.travelDistanceM!)}분
                    </span>
                  ) : (
                    <span className="sk-tag sk-tag-mute">
                      <Icon name="car" className="h-3 w-3" />
                      차량 {next.travelDurationMin}분
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
