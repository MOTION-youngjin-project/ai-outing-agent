"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession, signOut } from "next-auth/react";
import { useAppStore } from "@/lib/store";
import { fetchSavedPlaces, fetchPreferences, putPreferences, fetchRecentQuestions } from "@/lib/clientApi";
import { FILTER_LABELS } from "@/lib/placeTags";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";

// ponytail: "최근 추천"/"주차 저장" 통계는 여전히 스코프 밖이라 더미로 남겨둠.
const MYPAGE_STATS = { recentRecommendations: 8, savedParking: 3 };

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
  const auth = useSession();
  const queryClient = useQueryClient();

  // 마이페이지는 로그인 사용자 전용 — 세션이 없으면 화면을 그리지 않고 로그인으로 보낸다.
  useEffect(() => {
    if (auth.status === "unauthenticated") setView("login");
  }, [auth.status, setView]);

  const authed = auth.status === "authenticated";
  const savedPlacesQuery = useQuery({
    queryKey: ["saved-places"],
    queryFn: fetchSavedPlaces,
    enabled: authed,
  });
  const preferencesQuery = useQuery({
    queryKey: ["preferences"],
    queryFn: fetchPreferences,
    enabled: authed,
  });
  const recentQuestionsQuery = useQuery({
    queryKey: ["recent-questions"],
    queryFn: fetchRecentQuestions,
    enabled: authed,
  });

  async function togglePreference(tag: (typeof FILTER_LABELS)[number]) {
    const current = preferencesQuery.data ?? [];
    const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
    queryClient.setQueryData(["preferences"], next);
    await putPreferences(next);
  }

  // 알림 설정/방문 예정은 뒤에 걸 기능(알림 발송, 방문 예약) 자체가 앱에 없어서
  // 준비 중으로 남겨둔다 — onClick 없는 항목은 비활성 처리된다.
  const settingsMenu = [
    { label: "알림 설정", onClick: undefined },
    { label: "방문 예정", onClick: undefined },
    { label: "앱 설정", onClick: () => setView("settings") },
    { label: "로그아웃", onClick: () => signOut() },
  ];

  if (auth.status !== "authenticated") return null;
  const session = auth.data;

  return (
    <>
      <ScreenHeader
        title="마이페이지"
        onBack={() => setView("input")}
        right={
          <button onClick={() => setView("settings")} aria-label="설정" className="p-1 text-muted">
            <Icon name="gear" className="h-[22px] w-[22px]" />
          </button>
        }
      />
      <div className="flex flex-col gap-3 px-5">
        <div className="rounded-2xl bg-white px-4 py-4 shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
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
          <div className="mt-4 flex border-t border-hairline pt-3">
            {[
              { icon: "bookmark", label: "저장한 장소", value: savedPlacesQuery.data?.length ?? 0 },
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
          {savedPlacesQuery.data?.length === 0 && (
            <p className="px-4 py-4 text-[14px] text-muted">아직 저장한 장소가 없어요.</p>
          )}
          {(savedPlacesQuery.data ?? []).map((p, i) => (
              <div
                key={p.placeId}
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
          {FILTER_LABELS.map((tag) => {
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
          {recentQuestionsQuery.data?.length === 0 && (
            <p className="px-4 py-4 text-[14px] text-muted">아직 질문 기록이 없어요.</p>
          )}
          {(recentQuestionsQuery.data ?? []).map((q, i) => (
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
          {settingsMenu.map((item, i) => (
            <button
              key={item.label}
              onClick={item.onClick}
              disabled={!item.onClick}
              title={item.onClick ? undefined : "준비 중인 기능입니다"}
              className={`flex w-full items-center justify-between px-4 py-3.5 text-left text-[14px] font-medium ${
                item.onClick ? "text-ink" : "cursor-not-allowed text-ink/70"
              } ${i > 0 ? "border-t border-hairline" : ""}`}
            >
              {item.label}
              <Icon name="next" className="h-5 w-5 text-slate-300" />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
