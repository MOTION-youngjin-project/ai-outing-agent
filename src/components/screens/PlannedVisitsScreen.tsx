"use client";

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Icon } from "@/components/Icon";
import { fetchSavedPlaces, putPlannedVisit } from "@/lib/clientApi";
import { formatPlannedDate, todayIso } from "@/lib/textFormat";

export function PlannedVisitsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const plannedQuery = useQuery({
    queryKey: ["saved-places", "planned"],
    queryFn: () => fetchSavedPlaces(true),
  });

  const clearMutation = useMutation({
    mutationFn: (placeId: string) => putPlannedVisit(placeId, null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-places"] });
    },
  });

  const today = todayIso();
  const planned = plannedQuery.data ?? [];

  return (
    <>
      <ScreenHeader title="방문 예정" onBack={() => router.push("/mypage")} />

      <div className="flex flex-col gap-3 px-5">
        {plannedQuery.isLoading && <p className="text-[13px] text-muted">불러오는 중…</p>}

        {!plannedQuery.isLoading && planned.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-white px-5 py-10 text-center shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
            <Icon name="clock" className="h-7 w-7 text-mint-mid" />
            <p className="text-[14px] font-semibold text-ink">아직 방문 예정인 곳이 없어요</p>
            <p className="text-[13px] leading-relaxed text-muted">
              저장한 장소의 상세 화면에서 방문할 날짜를 정하면 여기에 모여요.
            </p>
          </div>
        )}

        {planned.map((p) => {
          const past = p.plannedVisitAt !== null && p.plannedVisitAt < today;
          return (
            <div
              key={p.placeId}
              className={`flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_1px_3px_rgba(17,24,39,0.05)] ${
                past ? "opacity-60" : ""
              }`}
            >
              <button
                onClick={() => router.push(`/place/${p.placeId}`)}
                className="flex flex-1 items-center gap-3 text-left"
              >
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 외부 공공데이터 이미지
                  <img src={p.imageUrl} alt={p.name} className="h-14 w-14 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-mint-soft">
                    <Icon name="pin" className="h-5 w-5 text-mint-mid" />
                  </div>
                )}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-bold text-accent">
                    {p.plannedVisitAt && formatPlannedDate(p.plannedVisitAt)}
                    {past && " · 지난 예정"}
                  </span>
                  <span className="text-[15px] font-semibold text-ink">{p.name}</span>
                  {p.categorySummary && (
                    <span className="text-[12px] text-muted">{p.categorySummary}</span>
                  )}
                </div>
              </button>

              <button
                onClick={() => clearMutation.mutate(p.placeId)}
                disabled={clearMutation.isPending}
                aria-label={`${p.name} 방문 예정 해제`}
                className="shrink-0 rounded-full px-3 py-2 text-[12px] font-semibold text-muted disabled:opacity-50"
              >
                해제
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
