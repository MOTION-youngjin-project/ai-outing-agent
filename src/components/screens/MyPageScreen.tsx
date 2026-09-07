"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession, signOut } from "next-auth/react";
import { useAppStore } from "@/lib/store";
import { fetchSavedPlaces, fetchPreferences, putPreferences, fetchRecentQuestions } from "@/lib/clientApi";
import { FILTER_LABELS } from "@/lib/placeTags";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";

// ponytail: "최근 추천"/"주차 저장" 통계는 여전히 스코프 밖이라 더미로 남겨둠.
const MYPAGE_STATS = { recentRecommendations: 8, savedParking: 3 };
const MYPAGE_SETTINGS_MENU = ["알림 설정", "방문 예정", "앱 설정", "로그아웃"];

// FILTER_LABELS(agent.ts의 PLACE_TAGS)와 같은 값 — 선호 조건 칩에 쓸 아이콘만 매핑.
const PREFERENCE_ICONS: Record<(typeof FILTER_LABELS)[number], string> = {
  실내: "home",
  야외: "sun",
  데이트: "heart",
  저비용: "won",
};

function formatKoreanDateTime(iso: string): string {
  const d = new Date(iso);
  const ampm = d.getHours() < 12 ? "오전" : "오후";
  const hour12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${ampm} ${hour12}:${pad(d.getMinutes())}`;
}

export function MyPageScreen() {
  const { setView } = useAppStore();
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  // 로그인 상태에서만 조회 — 로그아웃 상태로는 401만 날 뿐이라 요청 자체를 안 보낸다.
  const savedPlacesQuery = useQuery({
    queryKey: ["saved-places"],
    queryFn: fetchSavedPlaces,
    enabled: !!session,
  });
  const preferencesQuery = useQuery({
    queryKey: ["preferences"],
    queryFn: fetchPreferences,
    enabled: !!session,
  });
  const recentQuestionsQuery = useQuery({
    queryKey: ["recent-questions"],
    queryFn: fetchRecentQuestions,
    enabled: !!session,
  });

  async function togglePreference(tag: (typeof FILTER_LABELS)[number]) {
    if (!session) {
      setView("login");
      return;
    }
    const current = preferencesQuery.data ?? [];
    const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
    queryClient.setQueryData(["preferences"], next);
    await putPreferences(next);
  }

  return (
    <>
      <ScreenHeader
        title="마이페이지"
        onBack={() => setView("input")}
        right={
          <span className="p-1 text-muted">
            <Icon name="gear" className="h-[22px] w-[22px]" />
          </span>
        }
      />
      <div className="flex flex-col gap-3 px-5">
        <div className="rounded-2xl bg-white px-4 py-4 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
          {session ? (
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-mint-soft">
                <Icon name="user" className="h-7 w-7 text-mint-mid" />
              </div>
              <div className="flex-1">
                <div className="text-[17px] font-bold text-ink">{session.user?.name || session.user?.email}</div>
                <div className="mt-0.5 text-[13px] text-muted">저장한 나들이와 설정을 관리해요.</div>
              </div>
              <button onClick={() => signOut()} className="shrink-0 text-[13px] font-medium text-accent">
                로그아웃
              </button>
            </div>
          ) : (
            <button onClick={() => setView("login")} className="flex w-full items-center gap-3 text-left">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-mint-soft">
                <Icon name="user" className="h-7 w-7 text-mint-mid" />
              </div>
              <div className="flex-1">
                <div className="text-[17px] font-bold text-ink">로그인이 필요해요</div>
                <div className="mt-0.5 text-[13px] text-muted">로그인하고 저장한 장소를 확인하세요.</div>
              </div>
              <Icon name="next" className="h-5 w-5 text-slate-300" />
            </button>
          )}
          <div className="mt-4 flex border-t border-hairline pt-3">
            {[
              { icon: "bookmark", label: "저장한 장소", value: session ? (savedPlacesQuery.data?.length ?? 0) : 0 },
              { icon: "clock", label: "최근 추천", value: MYPAGE_STATS.recentRecommendations },
              { icon: "parking", label: "주차 저장", value: MYPAGE_STATS.savedParking },
            ].map((stat, i) => (
              <div
                key={stat.label}
                className={`flex flex-1 flex-col items-center gap-1 ${i > 0 ? "border-l border-hairline" : ""}`}
              >
                <span className="flex items-center gap-1 text-[12px] text-muted">
                  <Icon name={stat.icon} className="h-3.5 w-3.5 text-mint-mid" />
                  {stat.label}
                </span>
                <span className="text-[18px] font-bold text-ink">{stat.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between px-1 pt-1">
          <h2 className="text-[15px] font-bold text-ink">저장한 장소</h2>
          <span
            title="준비 중인 기능입니다"
            className="flex cursor-not-allowed items-center gap-0.5 text-[13px] text-muted/70"
          >
            전체 보기
            <Icon name="next" className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
          {!session && (
            <p className="px-4 py-4 text-[14px] text-muted">로그인하면 저장한 장소가 여기 보여요.</p>
          )}
          {session && savedPlacesQuery.data?.length === 0 && (
            <p className="px-4 py-4 text-[14px] text-muted">아직 저장한 장소가 없어요.</p>
          )}
          {session &&
            (savedPlacesQuery.data ?? []).map((p, i) => (
              <div
                key={p.placeId}
                className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-hairline" : ""}`}
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-mint-soft">
                  <Icon name="pin" className="h-5 w-5 text-mint-mid" />
                </div>
                <div className="flex-1">
                  <div className="text-[16px] font-bold text-ink">{p.name}</div>
                  <div className="mt-0.5 text-[13px] text-muted">
                    {p.categorySummary ?? p.roadAddress ?? ""}
                  </div>
                </div>
                <Icon name="next" className="h-5 w-5 text-slate-300" />
              </div>
            ))}
        </div>

        <h2 className="px-1 pt-1 text-[15px] font-bold text-ink">선호 조건</h2>
        <div className="flex flex-wrap gap-2">
          {!session && (
            <button onClick={() => setView("login")} className="text-[13px] text-muted">
              로그인하면 선호 조건을 저장할 수 있어요.
            </button>
          )}
          {session &&
            FILTER_LABELS.map((tag) => {
              const active = (preferencesQuery.data ?? []).includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => togglePreference(tag)}
                  className={
                    active
                      ? "flex items-center gap-1.5 rounded-full border border-accent bg-mint-bg px-3.5 py-1.5 text-[13px] font-semibold text-accent"
                      : "flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3.5 py-1.5 text-[13px] text-ink-soft"
                  }
                >
                  {tag === "저비용" ? (
                    <span className="text-[13px] font-semibold text-mint-mid">₩</span>
                  ) : (
                    <Icon name={PREFERENCE_ICONS[tag]} className="h-3.5 w-3.5 text-mint-mid" />
                  )}
                  {tag}
                </button>
              );
            })}
        </div>

        <div className="flex items-center justify-between px-1 pt-1">
          <h2 className="text-[15px] font-bold text-ink">최근 질문</h2>
          <span
            title="준비 중인 기능입니다"
            className="flex cursor-not-allowed items-center gap-0.5 text-[13px] text-muted/70"
          >
            전체 보기
            <Icon name="next" className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
          {!session && (
            <p className="px-4 py-4 text-[14px] text-muted">로그인하면 최근 질문 기록이 여기 보여요.</p>
          )}
          {session && recentQuestionsQuery.data?.length === 0 && (
            <p className="px-4 py-4 text-[14px] text-muted">아직 질문 기록이 없어요.</p>
          )}
          {session &&
            (recentQuestionsQuery.data ?? []).map((q, i) => (
              <div
                key={q.id}
                className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-hairline" : ""}`}
              >
                <Icon name="sparkle" className="h-5 w-5 shrink-0 text-mint-mid" />
                <div className="flex-1">
                  <div className="text-[14px] font-medium text-ink">{q.question}</div>
                  <div className="mt-0.5 text-[12px] text-muted">{formatKoreanDateTime(q.askedAt)}</div>
                </div>
                <Icon name="next" className="h-5 w-5 text-slate-300" />
              </div>
            ))}
        </div>

        <h2 className="px-1 pt-1 text-[15px] font-bold text-ink">설정</h2>
        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
          {MYPAGE_SETTINGS_MENU.map((label, i) => (
            <div
              key={label}
              title="준비 중인 기능입니다"
              className={`flex cursor-not-allowed items-center justify-between px-4 py-3.5 text-[14px] font-medium text-ink/70 ${
                i > 0 ? "border-t border-hairline" : ""
              }`}
            >
              {label}
              <Icon name="next" className="h-5 w-5 text-slate-300" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
