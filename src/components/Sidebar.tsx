"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { NAV_ITEMS, activeNavId, navDirection, type NavItemId } from "@/lib/nav";
import { beginNav, keepsNativeNavigation } from "@/lib/navMotion";
import {
  fetchRecentQuestions,
  fetchConversation,
  type RecentQuestion,
} from "@/lib/clientApi";
import { Logo, LogoMark } from "@/components/Logo";
import { summarize } from "@/hooks/useRecommendationFlow";
import { useAppStore } from "@/lib/store";
import { Icon } from "@/components/Icon";
import { ConversationItem } from "@/components/ConversationItem";
import type { ChatTurn } from "@/lib/agent";

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// 스크린샷의 "오늘/어제/이전 기록" 3개 그룹으로 나눈다.
function groupByDay(questions: RecentQuestion[]) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const groups: { label: string; items: RecentQuestion[] }[] = [
    { label: "고정됨", items: [] },
    { label: "오늘", items: [] },
    { label: "어제", items: [] },
    { label: "이전 기록", items: [] },
  ];

  for (const q of questions) {
    const d = new Date(q.askedAt);

    if (q.pinned) {
      groups[0].items.push(q);
    } else if (isSameDay(d, now)) {
      groups[1].items.push(q);
    } else if (isSameDay(d, yesterday)) {
      groups[2].items.push(q);
    } else {
      groups[3].items.push(q);
    }
  }

  return groups.filter((g) => g.items.length > 0);
}

// 오늘이면 "오전/오후 H:mm", 아니면 "M월 D일" — 사이드바 목록은 좁아서 짧은 포맷이 필요하다.
function formatEntryTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();

  if (isSameDay(d, now)) {
    const ampm = d.getHours() < 12 ? "오전" : "오후";
    const hour12 =
      d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;

    return `${ampm} ${hour12}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// develop은 이 자리의 DESKTOP_NAV에서 "저장"이 /mypage로 가던 것을 /saved로 고쳤다.
// 우리 쪽은 같은 버그를 다른 방식으로 고쳤다 — 목록 자체를 지우고 모바일 BottomNav와
// 같은 @/lib/nav의 NAV_ITEMS를 쓴다(저장 → /saved). 두 곳에 목록이 있으면 또 어긋나기
// 때문이고, 그래서 DESKTOP_NAV는 남겨두지 않는다(이 파일 어디에서도 참조하지 않는다).
export function Sidebar({
  onToggleRail,
}: {
  onToggleRail: () => void;
}) {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const closeSidebar = useAppStore((s) => s.closeSidebar);
  const setHistory = useAppStore((s) => s.setHistory);
  const setInput = useAppStore((s) => s.setInput);
  const setLastRecommendation = useAppStore(
    (s) => s.setLastRecommendation,
  );
  const setRecommendations = useAppStore(
    (s) => s.setRecommendations,
  );
  const setConversationId = useAppStore(
    (s) => s.setConversationId,
  );
  const setRegionId = useAppStore((s) => s.setRegionId);

  const lastRecommendation = useAppStore(
    (s) => s.lastRecommendation,
  );
  const conversationId = useAppStore(
    (s) => s.conversationId,
  );

  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { status } = useSession();

  const authed = status === "authenticated";
  const activeNav = activeNavId(pathname);

  const [search, setSearch] = useState("");

  const recentQuestionsQuery = useQuery({
    queryKey: ["recent-questions"],
    queryFn: fetchRecentQuestions,
    enabled: authed,
  });

  const filtered = (
    recentQuestionsQuery.data?.questions ?? []
  ).filter((q) =>
    q.question
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );

  const groups = groupByDay(filtered);

  // 사이드바 "대화" 항목 클릭 → 그 대화의 전체 turn을 불러와 홈 화면(채팅) 상태로
  // 복원한다 — 새로고침 시 초기화되는 것과 동일 원칙으로 URL에는 남기지 않는다.
  const openConversationMutation = useMutation({
    mutationFn: fetchConversation,
    onSuccess: (data) => {
      const history: ChatTurn[] = data.turns.flatMap((t) => [
        {
          role: "user",
          content: t.userQuery,
        },
        {
          role: "assistant",
          content: summarize(t.recommendation),
        },
      ]);

      setHistory(history);
      setRecommendations(
        data.turns.map((t) => t.recommendation),
      );
      setConversationId(data.conversationId);

      if (data.regionId) {
        setRegionId(data.regionId);
      }

      setLastRecommendation(
        data.turns[data.turns.length - 1]?.recommendation ??
          null,
      );

      setInput("");
      router.push("/");
      closeSidebar();
    },
  });

  function goLogin() {
    router.push(
      `/login?next=${encodeURIComponent(pathname)}`,
    );
  }

  // 전역 nav 이동 — 하단 탭과 같은 방향 규칙을 쓴다(순서: 챗·지도·저장·마이).
  // 새 질문·대화 기록은 화면 "안"의 이동이라 이 규칙을 쓰지 않는다.
  function goTab(
    e: React.MouseEvent,
    id: NavItemId,
    push: () => void,
  ) {
    if (keepsNativeNavigation(e)) return;

    const dir = navDirection(activeNav, id);

    if (!dir) return;

    e.preventDefault();
    beginNav(dir, push);
  }

  function onMapTab(e: React.MouseEvent) {
    if (keepsNativeNavigation(e)) {
      return goToMap();
    }

    const dir = navDirection(activeNav, "map");

    if (!dir) {
      return goToMap();
    }

    beginNav(dir, goToMap);
  }

  // 지도 탭 — 하단 탭(BottomNav.goToMap)과 같은 규칙이다. 방금 받은 추천이 있으면 그
  // 코스 지도로 바로 간다(캐시를 미리 채워 재요청 없이 뜬다). 없으면 /map.
  function goToMap() {
    if (lastRecommendation) {
      queryClient.setQueryData(
        ["recommend", lastRecommendation.agentRunId],
        lastRecommendation,
      );

      router.push(
        `/map/${lastRecommendation.agentRunId}`,
      );
    } else {
      router.push("/map");
    }

    closeSidebar();
  }

  function goNewQuestion() {
    setHistory([]);
    setInput("");
    setLastRecommendation(null);
    setRecommendations([]);
    setConversationId(null);
    router.push("/");
    closeSidebar();
  }

  return (
    <>
      {sidebarOpen && (
        <button
          aria-label="사이드바 닫기"
          onClick={closeSidebar}
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
        />
      )}

      {/* 폭·자리·열고 닫는 움직임은 globals.css의 .sk-side가 들고 있다(유틸리티로 두면
          1024 이상에서 흐름 안 요소로 바뀔 때 폭·position을 덮어쓸 수 없다).
          레일 폭이 실제로 다 바뀐 뒤에 resize를 한 번 알린다 — 네이버 지도는 컨테이너가
          줄고 늘어난 걸 스스로 알아채지 못해서, 접었다 펴면 잘린 채로 남는다. */}
      <aside
        className="sk-side"
        data-open={sidebarOpen ? "1" : undefined}
        onTransitionEnd={(e) => {
          if (e.propertyName === "width") {
            window.dispatchEvent(new Event("resize"));
          }
        }}
      >
        {/* 접힌 레일 — 같은 항목을 아이콘만으로 보여준다(1024 이상에서만 나타난다) */}
        <div className="sk-side-mini gap-2 px-3 pb-4 pt-5">
          <LogoMark className="h-7" />

          <button
            onClick={onToggleRail}
            aria-label="사이드바 펼치기"
            title="사이드바 펼치기"
            className="sk-side-icon"
          >
            <Icon name="next" className="h-5 w-5" />
          </button>

          <button
            onClick={goNewQuestion}
            aria-label="새 질문"
            title="새 질문"
            className="sk sk-primary sk-slot mt-1 h-10 w-10"
          >
            <Icon name="plus" className="h-4 w-4" />
          </button>

          {/* 펼친 상태와 같은 NAV_ITEMS를 돈다 — 두 상태의 목적지가 어긋날 수 없다. */}
          {NAV_ITEMS.map((item) => {
            const on = activeNav === item.id;
            const cls = `sk-side-icon${
              on ? " sk-side-icon-on" : ""
            }`;

            return item.id === "map" ? (
              <button
                key={item.id}
                onClick={onMapTab}
                aria-label={item.label}
                title={item.label}
                aria-current={
                  on ? "page" : undefined
                }
                className={cls}
              >
                <Icon
                  name={item.icon}
                  className="h-5 w-5"
                />
              </button>
            ) : (
              <Link
                key={item.id}
                href={item.href}
                onClick={(e) =>
                  goTab(e, item.id, () =>
                    router.push(item.href),
                  )
                }
                aria-label={item.label}
                title={item.label}
                aria-current={
                  on ? "page" : undefined
                }
                className={cls}
              >
                <Icon
                  name={item.icon}
                  className="h-5 w-5"
                />
              </Link>
            );
          })}
        </div>

        <div className="sk-side-full">
          {/* 사이드바 맨 위는 서비스 이름 자리다 — "대화 기록"은 아래 목록의 제목으로 옮겼다 */}
          <div className="flex items-center justify-between px-5 pt-5">
            <Logo className="h-[22px]" />

            <button
              onClick={closeSidebar}
              aria-label="닫기"
              className="p-1 text-ink lg:hidden"
            >
              <Icon
                name="close"
                className="h-5 w-5"
              />
            </button>

            <button
              onClick={onToggleRail}
              aria-label="사이드바 접기"
              title="사이드바 접기"
              className="sk-side-icon hidden lg:inline-flex"
            >
              <Icon
                name="back"
                className="h-5 w-5"
              />
            </button>
          </div>

          <div className="flex flex-col gap-2.5 px-5 pt-4">
            <button
              onClick={goNewQuestion}
              className="flex items-center justify-center gap-1.5 rounded-full bg-cta py-2.5 text-[14px] font-semibold text-white"
            >
              <Icon
                name="plus"
                className="h-4 w-4"
              />
              새 질문
            </button>

            {/* 접힌 레일과 같은 NAV_ITEMS — 같은 이름·아이콘·목적지로 간다(데스크톱 전용 줄) */}
            <div className="hidden gap-2 lg:flex">
              {NAV_ITEMS.map((item) => {
                const on = activeNav === item.id;

                const cls = `sk-side-nav flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[11px] ${
                  on
                    ? "sk-side-nav-on font-bold"
                    : "font-medium text-ink-soft"
                }`;

                return item.id === "map" ? (
                  <button
                    key={item.id}
                    onClick={onMapTab}
                    aria-current={
                      on ? "page" : undefined
                    }
                    className={cls}
                  >
                    <Icon
                      name={item.icon}
                      className="h-5 w-5"
                    />
                    {item.label}
                  </button>
                ) : (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={(e) =>
                      goTab(e, item.id, () =>
                        router.push(item.href),
                      )
                    }
                    aria-current={
                      on ? "page" : undefined
                    }
                    className={cls}
                  >
                    <Icon
                      name={item.icon}
                      className="h-5 w-5"
                    />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            {authed && (
              <div className="flex items-center gap-2 rounded-full bg-page px-3.5 py-2">
                <Icon
                  name="search"
                  className="h-4 w-4 text-muted"
                />

                <input
                  value={search}
                  onChange={(e) =>
                    setSearch(e.target.value)
                  }
                  placeholder="대화 기록 검색"
                  className="flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted/60"
                />
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-5 pt-4">
            <h2 className="sk-cap pb-2 text-[13px] font-bold text-ink">
              대화 기록
            </h2>

            {!authed ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <LogoMark className="h-9 opacity-40" />

                <p className="text-[13px] leading-relaxed text-muted">
                  로그인하면
                  <br />
                  대화 기록을 볼 수 있어요.
                </p>

                <button
                  onClick={goLogin}
                  className="rounded-full bg-mint-bg px-4 py-2 text-[13px] font-semibold text-accent"
                >
                  로그인하기
                </button>
              </div>
            ) : (
              <>
                {/* 불러오는 중에는 "없다"고 단정하지 않는다 — 로그아웃했다 다시
                    로그인하면 캐시가 비어 있어 매번 이 문구가 먼저 떴고, 기록이
                    사라진 것처럼 보였다. 실패했을 때도 마찬가지로 구분해서 알린다. */}
                {recentQuestionsQuery.isPending && (
                  <div
                    role="status"
                    aria-label="대화 기록 불러오는 중"
                    className="sk-scan flex flex-col gap-2.5 py-2"
                  >
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="flex flex-col gap-1.5"
                      >
                        <span className="sk-skel h-[14px] w-4/5" />
                        <span className="sk-skel h-[11px] w-24" />
                      </div>
                    ))}
                  </div>
                )}

                {recentQuestionsQuery.isError && (
                  <p
                    role="alert"
                    className="sk-rail-none py-6 text-center text-[13px] text-ink-soft"
                  >
                    기록을 불러오지 못했어요.{" "}
                    <button
                      onClick={() =>
                        recentQuestionsQuery.refetch()
                      }
                      className="font-semibold text-accent underline underline-offset-2"
                    >
                      다시 시도
                    </button>
                  </p>
                )}

                {recentQuestionsQuery.isSuccess &&
                  groups.length === 0 && (
                    <p className="py-6 text-center text-[13px] text-muted">
                      {search
                        ? "검색 결과가 없어요."
                        : "아직 질문 기록이 없어요."}
                    </p>
                  )}

                {groups.map((group) => (
                  <div
                    key={group.label}
                    className="pb-5"
                  >
                    <h2 className="pb-2 text-[12px] font-semibold text-muted">
                      {group.label}
                    </h2>

                    <div className="flex flex-col gap-1">
                      {group.items.map((q) => (
                        <ConversationItem
                          key={q.id}
                          item={q}
                          time={formatEntryTime(
                            q.askedAt,
                          )}
                          disabled={
                            openConversationMutation.isPending
                          }
                          onOpen={() =>
                            openConversationMutation.mutate(
                              q.id,
                            )
                          }
                          // 지금 채팅 화면에 떠 있는 대화를 지웠으면 빈 새 질문으로 비운다.
                          onDeleted={() => {
                            if (
                              q.id === conversationId
                            ) {
                              goNewQuestion();
                            }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {authed && (
            <p className="px-5 pb-5 pt-2 text-[11px] leading-relaxed text-muted">
              {openConversationMutation.isError
                ? "대화를 불러오지 못했어요. 다시 시도해주세요."
                : "대화를 선택하면 이전 추천 흐름을 그대로 이어갈 수 있어요."}
            </p>
          )}
        </div>
      </aside>
    </>
  );
}