"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { deleteSavedCourse, fetchSavedCourses, fetchSavedPlaces } from "@/lib/clientApi";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SavedCourseCard } from "@/components/SavedCourseCard";
import { extractCategoryLabel } from "@/lib/services/matching";
import { useReveal } from "@/lib/useReveal";
import { PlacePhoto } from "@/components/PlacePhoto";

type Tab = "course" | "place";
type SortKey = "recent" | "name";

const savedTabMemory: { tab: Tab } = { tab: "course" };

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "recent", label: "최근 저장순" },
  { id: "name", label: "이름순" },
];

// 정렬 고르기.
//
// 원래는 브라우저 기본 <select>였다. 두 가지가 문제였다.
//  1) 운영체제가 그린 목록이 떠서 이 줄만 다른 앱처럼 보였다(RegionPicker와 같은 이유).
//  2) <select>의 실제 렌더 폭이 브라우저가 레이아웃 때 잡은 폭보다 커서, 390 화면에서
//     오른쪽으로 44px 삐져나갔다(실측). shrink-0이라 줄어들지도 않았고, 본문의
//     overflow-x:clip에 잘려서 "화면 밖으로 튀어나간" 모습이 됐다.
// 이제 평범한 버튼 + 우리 창이라 폭이 글자 그대로 잡히고, 검색창이 남는 폭을 가져간다.
// 고르는 값(sort)과 올려보내는 값은 <select>와 똑같다 — 화면만 바뀐다.
function SortPicker({ value, onChange }: { value: SortKey; onChange: (next: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selected = SORT_OPTIONS.find((o) => o.id === value) ?? SORT_OPTIONS[0];

  return (
    <div ref={rootRef} className="sk-sort relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`정렬: ${selected.label}`}
        className={`sk-sort-btn ${open ? "relative z-30" : ""}`}
      >
        <span className="truncate">{selected.label}</span>
        <Icon
          name="down"
          className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${open ? "-rotate-180" : ""}`}
        />
      </button>

      {open && (
        <>
          {/* 가림막은 이 컴포넌트 안에 있어서 바깥 클릭 감지(rootRef.contains)에 걸리지 않는다 —
              가림막 자신이 닫도록 직접 달아준다. */}
          <div
            aria-hidden
            onPointerDown={() => setOpen(false)}
            className="sk-scrim fixed inset-0 z-20 bg-ink/5"
          />
          <div
            aria-label="정렬 고르기"
            className="sk-panel sk-drop sk-drop-right sk-sort-menu absolute right-0 top-[calc(100%+6px)] z-30 overflow-hidden p-1.5"
          >
            {SORT_OPTIONS.map((option) => {
              const active = option.id === value;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-[11px] px-3 py-2.5 text-left text-[14px] ${
                    active ? "bg-mint-bg font-bold text-accent-deep" : "font-medium text-ink"
                  }`}
                >
                  {option.label}
                  {active && <Icon name="check" className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// 디자인/저장.png — "코스"/"장소" 토글 + 검색 + 정렬. 검색/정렬은 이미 받아온 목록을
// 그대로 거르는 클라이언트 처리다(저장 개수가 많지 않아 서버 쿼리까지 갈 이유가 없음).
export function SavedScreen() {
  const router = useRouter();
  const auth = useSession();
  const queryClient = useQueryClient();
  const authed = auth.status === "authenticated";

  // 장소 탭에서 장소를 열었다가 뒤로 오면 다시 장소 탭이어야 한다 — 로컬 state만
  // 두면 돌아올 때마다 "코스" 탭으로 초기화됐다. 앱 안에서만 유지하면 되는 값이라
  // 모듈 변수에 둔다(새로고침하면 기본값으로).
  const [tab, setTab] = useState<Tab>(() => savedTabMemory.tab);
  useEffect(() => {
    savedTabMemory.tab = tab;
  }, [tab]);
  const listRef = useReveal<HTMLDivElement>();
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
            className="rounded-full bg-cta px-5 py-2.5 text-[14px] font-semibold text-white"
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
      <div className="sk-sv flex flex-col gap-3 px-5">
        <div className="sk-sv-tabs flex gap-2 rounded-full bg-white p-1 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
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
                  ? "flex-1 rounded-full bg-cta py-2 text-[14px] font-semibold text-white"
                  : "flex-1 rounded-full py-2 text-[14px] font-medium text-muted"
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="sk-sv-find flex items-center gap-2">
          {/* min-w-0 없으면 이 flex 아이템의 기본 최소폭(auto)이 내용물 크기로 잡혀서,
              좁은 화면에서 옆의 select(shrink-0, "최근 저장순")가 화면 밖으로 밀려난다. */}
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-4 py-2.5 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
            <Icon name="search" className="h-4 w-4 shrink-0 text-muted" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="저장한 코스나 장소 검색"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted/60"
            />
          </div>
          <SortPicker value={sort} onChange={setSort} />
        </div>

        {tab === "course" ? (
          <div ref={listRef} data-reveal="wait" className="sk-sv-list flex flex-col gap-3">
            {coursesQuery.isLoading && <p className="px-1 text-[13px] text-muted">불러오는 중...</p>}
            {coursesQuery.data && courses.length === 0 && (
              <p className="sk-empty px-1 py-6 text-center text-[14px] text-muted">
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
          <div className="sk-sv-list overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(17,24,39,0.05)]" data-reveal="in">
            {placesQuery.isLoading && <p className="px-4 py-4 text-[13px] text-muted">불러오는 중...</p>}
            {placesQuery.data && places.length === 0 && (
              <p className="sk-empty px-4 py-4 text-[14px] text-muted">
                {query ? "검색 결과가 없어요." : "아직 저장한 장소가 없어요."}
              </p>
            )}
            {places.map((p, i) => (
              <Link
                key={p.placeId}
                href={`/place/${p.placeId}`}
                className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-hairline" : ""}`}
              >
                <PlacePhoto
                  placeId={p.placeId}
                  name={p.name}
                  className="w-14 shrink-0"
                  imageClassName="h-14 w-14"
                  fallback={
                    p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 외부 공공데이터 이미지, 도메인 사전등록 불필요한 일반 img로 처리
                      <img src={p.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-mint-soft">
                        <Icon name="pin" className="h-5 w-5 text-mint-mid" />
                      </div>
                    )
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-bold text-ink">{p.name}</div>
                  <div className="mt-0.5 truncate text-[13px] text-muted">
                    {extractCategoryLabel(p.categorySummary ?? null) ?? p.roadAddress ?? ""}
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
