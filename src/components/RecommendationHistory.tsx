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
  return <section className="rounded-2xl bg-white p-4" aria-label="내 추천 기록">
    <h2 className="text-[15px] font-bold text-ink">내 추천 기록</h2>
    <p className="mt-1 text-xs text-muted">24시간 안에 만든 추천을 최대 50개까지 다시 볼 수 있어요.</p>
    {history.isPending && <p role="status" className="mt-3 text-sm">불러오는 중…</p>}
    {history.isError && <p role="alert" className="mt-3 text-sm">기록을 불러오지 못했습니다. <button onClick={() => history.refetch()} className="underline">다시 시도</button></p>}
    {history.data?.length === 0 && <p className="mt-3 text-sm text-muted">아직 추천 기록이 없어요.</p>}
    {deletion.isError && <p role="alert" className="mt-3 text-sm text-red-700">{deletion.error.message}</p>}
    <ul className="mt-2 divide-y divide-hairline">
      {history.data?.map(item => <li key={item.id} className="flex items-center gap-3 py-3">
        <Link href={`/recommend/${item.id}`} className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.question}</p>
          <time className="text-xs text-muted" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("ko-KR")}</time>
        </Link>
        <button className="shrink-0 px-2 py-2 text-sm text-muted disabled:opacity-50" aria-label={`${item.question} 기록 삭제`} disabled={deletion.isPending} onClick={() => deletion.mutate(item.id)}>삭제</button>
      </li>)}
    </ul>
  </section>;
}
