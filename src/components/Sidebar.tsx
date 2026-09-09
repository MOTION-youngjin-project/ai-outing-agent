"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { fetchRecentQuestions, type RecentQuestion } from "@/lib/clientApi";
import { useAppStore } from "@/lib/store";
import { Icon } from "@/components/Icon";

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// 스크린샷의 "오늘/어제/이전 기록" 3개 그룹으로 나눈다.
function groupByDay(questions: RecentQuestion[]) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const groups: { label: string; items: RecentQuestion[] }[] = [
    { label: "오늘", items: [] },
    { label: "어제", items: [] },
    { label: "이전 기록", items: [] },
  ];
  for (const q of questions) {
    const d = new Date(q.askedAt);
    if (isSameDay(d, now)) groups[0].items.push(q);
    else if (isSameDay(d, yesterday)) groups[1].items.push(q);
    else groups[2].items.push(q);
  }
  return groups.filter((g) => g.items.length > 0);
}

// 오늘이면 "오전/오후 H:mm", 아니면 "M월 D일" — 사이드바 목록은 좁아서 짧은 포맷이 필요하다.
function formatEntryTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (isSameDay(d, now)) {
    const ampm = d.getHours() < 12 ? "오전" : "오후";
    const hour12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
    return `${ampm} ${hour12}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

const DESKTOP_NAV = [
  { label: "추천", href: "/recommend", icon: "compass" },
  { label: "저장", href: "/mypage", icon: "heart" },
  { label: "마이페이지", href: "/mypage", icon: "user" },
] as const;

export function Sidebar() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const closeSidebar = useAppStore((s) => s.closeSidebar);
  const setHistory = useAppStore((s) => s.setHistory);
  const setInput = useAppStore((s) => s.setInput);
  const setLastRecommendation = useAppStore((s) => s.setLastRecommendation);
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();
  const authed = status === "authenticated";

  const [search, setSearch] = useState("");
  const recentQuestionsQuery = useQuery({
    queryKey: ["recent-questions"],
    queryFn: fetchRecentQuestions,
    enabled: authed,
  });
  const filtered = (recentQuestionsQuery.data?.questions ?? []).filter((q) =>
    q.question.toLowerCase().includes(search.trim().toLowerCase())
  );
  const groups = groupByDay(filtered);

  function goLogin() {
    router.push(`/login?next=${encodeURIComponent(pathname)}`);
  }

  function goNewQuestion() {
    setHistory([]);
    setInput("");
    setLastRecommendation(null);
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
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[320px] max-w-[85vw] flex-col overflow-y-auto bg-white transition-transform duration-200 lg:z-auto lg:w-[280px] lg:max-w-none lg:translate-x-0 lg:border-r lg:border-hairline ${
          sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <h1 className="text-[20px] font-bold text-ink">대화 기록</h1>
          <button onClick={closeSidebar} aria-label="닫기" className="p-1 text-ink lg:hidden">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-2.5 px-5 pt-4">
          <button
            onClick={goNewQuestion}
            className="flex items-center justify-center gap-1.5 rounded-full bg-accent py-2.5 text-[14px] font-semibold text-white"
          >
            <Icon name="plus" className="h-4 w-4" />새 질문
          </button>

          <div className="hidden gap-2 lg:flex">
            {DESKTOP_NAV.map((item) =>
              authed ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium text-ink-soft hover:bg-mint-bg"
                >
                  <Icon name={item.icon} className="h-5 w-5" />
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.label}
                  onClick={goLogin}
                  className="flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium text-muted hover:bg-mint-bg"
                >
                  <Icon name={item.icon} className="h-5 w-5" />
                  {item.label}
                </button>
              )
            )}
          </div>

          {authed && (
            <div className="flex items-center gap-2 rounded-full bg-page px-3.5 py-2">
              <Icon name="search" className="h-4 w-4 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="대화 기록 검색"
                className="flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted/60"
              />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 pt-4">
          {!authed ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
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
              {groups.length === 0 && (
                <p className="py-6 text-center text-[13px] text-muted">
                  {search ? "검색 결과가 없어요." : "아직 질문 기록이 없어요."}
                </p>
              )}
              {groups.map((group) => (
                <div key={group.label} className="pb-5">
                  <h2 className="pb-2 text-[12px] font-semibold text-muted">{group.label}</h2>
                  <div className="flex flex-col gap-1">
                    {group.items.map((q) => (
                      <Link
                        key={q.id}
                        href={`/recommend/${q.id}`}
                        onClick={closeSidebar}
                        className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-page"
                      >
                        <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full border border-hairline" />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">{q.question}</span>
                        <span className="shrink-0 text-[11px] text-muted">{formatEntryTime(q.askedAt)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {authed && (
          <p className="px-5 pb-5 pt-2 text-[11px] leading-relaxed text-muted">
            대화를 선택하면 이전 추천 흐름을 그대로 이어갈 수 있어요.
          </p>
        )}
      </aside>
    </>
  );
}
