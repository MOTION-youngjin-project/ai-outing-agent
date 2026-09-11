"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { WALK_DISTANCE_THRESHOLD_M, estimateWalkMinutes } from "@/lib/travelMode";
import type { SavedCourseResult } from "@/lib/clientApi";

function formatSavedDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} 저장`;
}

// 디자인/저장.png의 저장한 코스 카드. 목업의 "총 4시간 30분 · 예상 18,000원" 요약은
// 백엔드에 합산 필드가 없어(장소별 자유텍스트뿐) 넣지 않고, 실제로 가진 값인 태그만 보여준다.
export function SavedCourseCard({
  saved,
  onDelete,
  deleting,
}: {
  saved: SavedCourseResult;
  onDelete: () => void;
  deleting: boolean;
}) {
  const router = useRouter();
  const places = saved.course.places ?? [];
  const tags = Array.from(new Set(places.flatMap((p) => p.tags ?? [])));

  return (
    <div className="rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(17,24,39,0.06)]">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[16px] font-bold leading-snug text-ink">{saved.title}</h3>
          <p className="mt-1 text-[12px] text-muted">{formatSavedDate(saved.savedAt)}</p>
        </div>
        <details className="group relative [&_summary::-webkit-details-marker]:hidden">
          <summary
            aria-label="코스 메뉴 열기"
            className="flex h-7 w-7 list-none items-center justify-center rounded-full text-muted marker:content-none"
          >
            <Icon name="more" className="h-4 w-4" />
          </summary>
          <div className="absolute right-0 z-10 mt-1 w-28 rounded-xl bg-white p-1.5 shadow-[0_1px_6px_rgba(17,24,39,0.15)]">
            <button
              onClick={onDelete}
              disabled={deleting}
              className="w-full rounded-lg py-2 text-[13px] font-medium text-red-500 hover:bg-page disabled:text-slate-300"
            >
              {deleting ? "삭제 중..." : "삭제"}
            </button>
          </div>
        </details>
      </div>

      {/* 정류지 가로 스트립 — 구간 사이에 도보/차량 이동시간을 끼워 넣는다. */}
      <div className="mt-3 flex items-start gap-1 overflow-x-auto pb-1">
        {places.map((p, i) => (
          <div key={i} className="flex shrink-0 items-start gap-1">
            {i > 0 && (
              <div className="flex w-16 shrink-0 flex-col items-center gap-0.5 pt-7 text-[10px] font-medium text-muted">
                {p.travelDurationMin != null && p.travelDistanceM != null && (
                  <span className="flex items-center gap-0.5 whitespace-nowrap">
                    {p.travelDistanceM < WALK_DISTANCE_THRESHOLD_M ? (
                      <>
                        <Icon name="walk" className="h-3 w-3" />
                        도보 {estimateWalkMinutes(p.travelDistanceM)}분
                      </>
                    ) : (
                      <>
                        <Icon name="car" className="h-3 w-3" />
                        차량 {p.travelDurationMin}분
                      </>
                    )}
                  </span>
                )}
                <span className="h-px w-full bg-hairline" />
              </div>
            )}
            <div className="flex w-[84px] shrink-0 flex-col items-center gap-1">
              <div className="relative">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 외부 공공데이터 이미지, 도메인 사전등록 불필요한 일반 img로 처리
                  <img src={p.imageUrl} alt={p.name} className="h-[60px] w-[84px] rounded-xl object-cover" />
                ) : (
                  <div className="flex h-[60px] w-[84px] items-center justify-center rounded-xl bg-mint-soft">
                    <Icon name="pin" className="h-5 w-5 text-mint-mid" />
                  </div>
                )}
                <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                  {i + 1}
                </span>
              </div>
              <span className="line-clamp-1 w-full text-center text-[11px] text-ink-soft">{p.name}</span>
            </div>
          </div>
        ))}
      </div>

      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-hairline pt-3">
          {tags.map((t) => (
            <span key={t} className="rounded-full bg-mint-bg px-2.5 py-1 text-[11px] font-medium text-accent">
              {t}
            </span>
          ))}
        </div>
      )}

      <button
        onClick={() => router.push(`/saved/${saved.publicId}`)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-accent py-3 text-[14px] font-semibold text-white"
      >
        <Icon name="compass" className="h-4 w-4" />
        코스 다시 보기
      </button>
    </div>
  );
}
