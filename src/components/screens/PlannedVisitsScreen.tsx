"use client";
import { PlacePhoto } from "@/components/PlacePhoto";

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

      <div className="sk-stagger flex flex-col gap-3 px-5">
        {plannedQuery.isLoading && (
          <div className="sk-stagger flex flex-col gap-3" role="status" aria-label="방문 예정 불러오는 중">
            {[0, 1].map((i) => (
              <div key={i} className="sk-panel flex items-center gap-3 px-4 py-3">
                <span className="sk-skel h-14 w-14 shrink-0" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <span className="sk-skel h-[13px] w-24" />
                  <span className="sk-skel h-[15px] w-40" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!plannedQuery.isLoading && planned.length === 0 && (
          <div className="sk-panel flex flex-col items-center gap-2 px-5 py-10 text-center">
            <span className="sk-slot h-11 w-11">
              <Icon name="clock" className="h-5 w-5" />
            </span>
            <p className="mt-1 text-[14px] font-semibold text-ink">아직 방문 예정인 곳이 없어요</p>
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
              className={`sk-panel flex items-center gap-3 px-4 py-3 ${past ? "opacity-60" : ""}`}
            >
              <PlacePhoto placeId={p.placeId} name={p.name} />
              <button
                onClick={() => router.push(`/place/${p.placeId}`)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >

                {/* 날짜는 사용자가 직접 지정한 확정값이라 실선 레일,
                    지난 예정은 더 이상 유효하지 않으므로 옅은 레일로 형태가 바뀐다. */}
                <div className={`flex min-w-0 flex-col gap-0.5 ${past ? "sk-rail-none" : "sk-rail"}`}>
                  <span className={`text-[13px] font-bold ${past ? "text-muted" : "text-accent"}`}>
                    {p.plannedVisitAt && formatPlannedDate(p.plannedVisitAt)}
                    {past && " · 지난 예정"}
                  </span>
                  <span className="truncate text-[15px] font-semibold text-ink">{p.name}</span>
                  {p.categorySummary && (
                    <span className="truncate text-[12px] text-muted">{p.categorySummary}</span>
                  )}
                </div>
              </button>

              <button
                onClick={() => clearMutation.mutate(p.placeId)}
                disabled={clearMutation.isPending}
                aria-label={`${p.name} 방문 예정 해제`}
                className="sk sk-quiet shrink-0 px-3 py-2 text-[12px] font-semibold text-muted"
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
