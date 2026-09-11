"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { deleteSavedCourse, fetchSavedCourses, fetchSavedPlaces } from "@/lib/clientApi";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SavedCourseCard } from "@/components/SavedCourseCard";

type Tab = "course" | "place";
type SortKey = "recent" | "name";

// 디자인/저장.png — "코스"/"장소" 토글 + 검색 + 정렬. 검색/정렬은 이미 받아온 목록을
// 그대로 거르는 클라이언트 처리다(저장 개수가 많지 않아 서버 쿼리까지 갈 이유가 없음).
export function SavedScreen() {
  const router = useRouter();
  const auth = useSession();
  const queryClient = useQueryClient();
  const authed = auth.status === "authenticated";

  const [tab, setTab] = useState<Tab>("course");
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  const coursesQuery = useQuery({
    queryKey: ["saved-courses"],
    queryFn: fetchSavedCourses,
    enabled: authed,
  });
  const placesQuery = useQuery({
    queryKey: ["saved-places"],
    queryFn: () => fetchSavedPlaces(),
    enabled: authed,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSavedCourse,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-courses"] }),
  });

  const query = keyword.trim();
  const courses = (coursesQuery.data ?? [])
    .filter(
      (c) =>
        !query ||
        c.title.includes(query) ||
        (c.course.places ?? []).some((p) => p.name.includes(query))
    )
    .sort((a, b) => (sort === "name" ? a.title.localeCompare(b.title) : 0));
  const places = (placesQuery.data ?? [])
    .filter((p) => !query || p.name.includes(query))
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : 0));

  if (auth.status === "loading") return null;
  if (!authed) {
    return (
      <>
        <ScreenHeader title="저장" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-[15px] leading-relaxed text-muted">
            로그인하면 저장한 코스와 장소를
            <br />
            여기서 다시 볼 수 있어요.
          </p>
          <button
            onClick={() => router.push("/login?next=/saved")}
            className="rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-white"
          >
            로그인하기
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader title="저장" />
      <div className="flex flex-col gap-3 px-5">
        <div className="flex gap-2 rounded-full bg-white p-1 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
          {(
            [
              { id: "course", label: "코스" },
              { id: "place", label: "장소" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? "flex-1 rounded-full bg-accent py-2 text-[14px] font-semibold text-white"
                  : "flex-1 rounded-full py-2 text-[14px] font-medium text-muted"
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-4 py-2.5 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
            <Icon name="search" className="h-4 w-4 shrink-0 text-muted" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="저장한 코스나 장소 검색"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted/60"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="shrink-0 rounded-full bg-white px-3 py-2.5 text-[13px] font-medium text-ink-soft shadow-[0_1px_3px_rgba(17,24,39,0.05)] outline-none"
          >
            <option value="recent">최근 저장순</option>
            <option value="name">이름순</option>
          </select>
        </div>

        {tab === "course" ? (
          <div className="flex flex-col gap-3">
            {coursesQuery.isLoading && <p className="px-1 text-[13px] text-muted">불러오는 중...</p>}
            {coursesQuery.data && courses.length === 0 && (
              <p className="px-1 py-6 text-center text-[14px] text-muted">
                {query ? "검색 결과가 없어요." : "아직 저장한 코스가 없어요."}
              </p>
            )}
            {courses.map((c) => (
              <SavedCourseCard
                key={c.publicId}
                saved={c}
                onDelete={() => deleteMutation.mutate(c.publicId)}
                deleting={deleteMutation.isPending && deleteMutation.variables === c.publicId}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
            {placesQuery.isLoading && <p className="px-4 py-4 text-[13px] text-muted">불러오는 중...</p>}
            {placesQuery.data && places.length === 0 && (
              <p className="px-4 py-4 text-[14px] text-muted">
                {query ? "검색 결과가 없어요." : "아직 저장한 장소가 없어요."}
              </p>
            )}
            {places.map((p, i) => (
              <Link
                key={p.placeId}
                href={`/place/${p.placeId}`}
                className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-hairline" : ""}`}
              >
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 외부 공공데이터 이미지, 도메인 사전등록 불필요한 일반 img로 처리
                  <img src={p.imageUrl} alt={p.name} className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-mint-soft">
                    <Icon name="pin" className="h-5 w-5 text-mint-mid" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-bold text-ink">{p.name}</div>
                  <div className="mt-0.5 truncate text-[13px] text-muted">
                    {p.categorySummary ?? p.roadAddress ?? ""}
                  </div>
                </div>
                <Icon name="next" className="h-5 w-5 shrink-0 text-slate-300" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
