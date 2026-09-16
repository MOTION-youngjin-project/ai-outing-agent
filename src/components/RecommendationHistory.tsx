"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";

type HistoryItem = { id: string; question: string; createdAt: string; expiresAt: string };
export function RecommendationHistory({ userId }: { userId: string }) {
  const client = useQueryClient();
  const history = useQuery({ queryKey: ["recommendations", userId], queryFn: async ({ signal }) => {
    const res = await fetch("/api/recommendations", { signal });
    if (!res.ok) throw new Error("추천 기록을 불러오지 못했습니다.");
    return (await res.json()).data as HistoryItem[];
  } });
  const deletion = useMutation({ mutationFn: async (id: string) => {
    const res = await fetch(`/api/recommendations/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) throw new Error("삭제하지 못했습니다. 다시 시도해 주세요.");
    return id;
  }, onSuccess: async id => {
    await client.cancelQueries({ queryKey: ["recommend", id] });
    client.removeQueries({ queryKey: ["recommend", id] });
    const store = useAppStore.getState();
    if (store.lastRecommendation?.agentRunId === id) {
      store.setLastRecommendation(null); store.setHistory([]); store.setInput("");
    }
    await Promise.all([client.invalidateQueries({ queryKey: ["recommendations"] }), client.invalidateQueries({ queryKey: ["recent-questions"] })]);
  } });
  return <section className="sk-panel sk-enter sk-stagger p-4" aria-label="내 추천 기록">
    <h2 className="sk-cap text-[15px] font-bold text-ink">내 추천 기록</h2>
    <p className="mt-1.5 pl-[11px] text-[12px] text-muted">24시간 안에 만든 추천을 최대 50개까지 다시 볼 수 있어요.</p>
    {history.isPending && <div role="status" className="sk-scan mt-3 flex flex-col gap-2.5 rounded-xl" aria-label="추천 기록 불러오는 중">
      {[0, 1].map(i => <div key={i} className="flex flex-col gap-1.5">
        <span className="sk-skel h-[14px] w-3/4" />
        <span className="sk-skel h-[12px] w-32" />
      </div>)}
    </div>}
    {history.isError && <p role="alert" className="sk-rail-none mt-3 py-1 text-[13px] text-ink-soft">기록을 불러오지 못했습니다. <button onClick={() => history.refetch()} className="font-semibold text-accent underline underline-offset-2">다시 시도</button></p>}
    {history.data?.length === 0 && <p className="sk-rail-none mt-3 py-1 text-[13px] text-muted">아직 추천 기록이 없어요.</p>}
    {deletion.isError && <p role="alert" className="sk-rail-none mt-3 py-1 text-[13px] text-ink-soft">{deletion.error.message}</p>}
    <ul className="sk-stagger mt-2 divide-y divide-hairline">
      {history.data?.map(item => <li key={item.id} className="flex items-center gap-3 py-3">
        {/* 저장된 추천 하나하나가 "다시 열 수 있는 기록"이라 실선 레일 — 목록 안에서
            항목 경계가 divide 선 말고도 형태로 잡힌다. */}
        <Link href={`/recommend/${item.id}`} className="sk-rail min-w-0 flex-1 py-0.5">
          <p className="truncate text-[14px] font-medium text-ink">{item.question}</p>
          <time className="text-[12px] text-muted" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("ko-KR")}</time>
        </Link>
        <button className="sk sk-quiet shrink-0 px-3 py-1.5 text-[12px] font-semibold text-muted" aria-label={`${item.question} 기록 삭제`} disabled={deletion.isPending} onClick={() => deletion.mutate(item.id)}>삭제</button>
      </li>)}
    </ul>
  </section>;
}
