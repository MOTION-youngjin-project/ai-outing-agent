"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { useReveal } from "@/lib/useReveal";

// 마이페이지의 "내 추천 기록" — 이 화면에서만 쓴다.
// 예전엔 큰 카드(sk-panel) 안에 목록이 또 들어 있어, 리스트형 정보인데도 카드 덩어리로
// 읽혔다. 이제 섹션 제목 + 얇은 row 목록이다(면·그림자 없음, 구분선만).
// 조회·삭제·에러·빈 상태 로직은 그대로다.
type HistoryItem = { id: string; question: string; createdAt: string; expiresAt: string };
export function RecommendationHistory({ userId }: { userId: string }) {
  const client = useQueryClient();
  const sectionRef = useReveal<HTMLElement>();
  // 지우는 중인 줄 — 서버가 성공을 준 "뒤" 그 줄만 접으며 내보낸다. 요청 자체를
  // 늦추지 않고, 실패하면 이 값이 채워지지 않으므로 줄도 사라지지 않는다.
  const [removingId, setRemovingId] = useState<string | null>(null);
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
    setRemovingId(id);
    // 접히는 동안(260ms)은 목록을 다시 불러오지 않는다 — 그래야 줄이 사라지는 게 보인다.
    await new Promise((r) => setTimeout(r, 260));
    await client.cancelQueries({ queryKey: ["recommend", id] });
    client.removeQueries({ queryKey: ["recommend", id] });
    const store = useAppStore.getState();
    if (store.lastRecommendation?.agentRunId === id) {
      store.setLastRecommendation(null); store.setHistory([]); store.setInput("");
    }
    await Promise.all([client.invalidateQueries({ queryKey: ["recommendations"] }), client.invalidateQueries({ queryKey: ["recent-questions"] })]);
    setRemovingId(null);
  } });
  return <section ref={sectionRef} data-reveal="wait" className="sk-my-sec sk-my-a-hist" aria-label="내 추천 기록">
    <div className="sk-my-sec-head">
      <h2 className="sk-cap sk-my-title">내 추천 기록</h2>
    </div>
    <p className="sk-my-desc">24시간 안에 만든 추천을 최대 50개까지 다시 볼 수 있어요.</p>
    {history.isPending && <div role="status" className="sk-scan mt-3 flex flex-col gap-2.5 rounded-xl" aria-label="추천 기록 불러오는 중">
      {[0, 1].map(i => <div key={i} className="flex flex-col gap-1.5">
        <span className="sk-skel h-[14px] w-3/4" />
        <span className="sk-skel h-[12px] w-32" />
      </div>)}
    </div>}
    {history.isError && <p role="alert" className="sk-my-empty">기록을 불러오지 못했습니다. <button onClick={() => history.refetch()} className="font-semibold text-accent underline underline-offset-2">다시 시도</button></p>}
    {history.data?.length === 0 && <p className="sk-my-empty">아직 추천 기록이 없어요.</p>}
    {deletion.isError && <p role="alert" className="sk-my-empty">{deletion.error.message}</p>}
    {!!history.data?.length && <ul className="sk-my-list sk-stagger">
      {history.data.map(item => <li key={item.id} className={`sk-my-row${removingId === item.id ? " sk-row-out" : ""}`}>
        <Link href={`/recommend/${item.id}`} className="sk-my-row-body">
          <p className="sk-my-row-title truncate">{item.question}</p>
          <time className="sk-my-row-sub block" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("ko-KR")}</time>
        </Link>
        <button className="sk-my-del" aria-label={`${item.question} 기록 삭제`} disabled={deletion.isPending} onClick={() => deletion.mutate(item.id)}>삭제</button>
      </li>)}
    </ul>}
  </section>;
}
