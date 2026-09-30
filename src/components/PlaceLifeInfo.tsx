"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TOPIC_LABEL, type PlaceLifeInfo as PlaceLifeInfoData } from "@/lib/life-info";

async function load(placeId: string, refresh: boolean): Promise<PlaceLifeInfoData> {
  const response = await fetch(`/api/places/${encodeURIComponent(placeId)}/life-info${refresh ? "?refresh=1" : ""}`);
  const body = await response.json() as { data?: PlaceLifeInfoData; error?: string };
  if (!response.ok || !body.data) throw new Error(body.error ?? "생활정보를 불러오지 못했습니다.");
  return body.data;
}

export function PlaceLifeInfo({ placeId }: { placeId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const query = useQuery({ queryKey: ["place-life-info", placeId, refreshKey], queryFn: () => load(placeId, refreshKey > 0), enabled, staleTime: Infinity, retry: false });

  if (!enabled) return <button type="button" onClick={() => setEnabled(true)} className="w-full rounded-2xl border border-accent/30 bg-mint-bg px-4 py-3 text-[14px] font-semibold text-accent">주차·셔틀·휴무 등 생활정보 찾기</button>;
  return <section className="rounded-2xl bg-white px-4 py-4 shadow-[0_1px_3px_rgba(17,24,39,0.05)]" aria-labelledby="life-info-heading">
    <div className="flex items-center justify-between gap-3">
      <h3 id="life-info-heading" className="text-[15px] font-bold text-ink">추가로 발견한 이용 정보</h3>
      <button type="button" disabled={query.isFetching} onClick={() => setRefreshKey((v) => v + 1)} className="text-[12px] font-semibold text-accent disabled:opacity-50">최신 정보 다시 확인</button>
    </div>
    {query.isLoading && <p role="status" className="mt-3 text-[13px] text-muted">공식 자료와 웹문서를 확인하고 있습니다...</p>}
    {query.isError && <p role="alert" className="mt-3 text-[13px] text-rose-600">{query.error instanceof Error ? query.error.message : "생활정보를 불러오지 못했습니다."}</p>}
    {query.data?.notice && <p className="mt-3 text-[13px] text-muted">{query.data.notice}</p>}
    {query.data?.items.map((item, index) => <div key={`${item.topic}-${index}`} className="mt-3 border-t border-hairline pt-3">
      <div className="flex items-center gap-2"><strong className="text-[13px] text-ink">{TOPIC_LABEL[item.topic]}</strong><span className="rounded-full bg-mint-bg px-2 py-0.5 text-[11px] text-accent">{item.confidence === "confirmed" ? "공식 확인" : item.confidence === "reference" ? "참고" : "방문 전 확인"}</span></div>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{item.summary}</p>
      <div className="mt-1 flex flex-wrap gap-2">{item.sourceIndexes.map((sourceIndex) => { const source = query.data?.sources[sourceIndex]; return source ? <span key={source.url} className="text-[12px] text-muted"><a href={source.url} target="_blank" rel="noreferrer" className="font-semibold text-accent underline">원문 확인</a>{source.publishedAt ? ` · 게시 ${new Date(source.publishedAt).toLocaleDateString("ko-KR")}` : " · 게시일 확인 필요"}</span> : null; })}</div>
    </div>)}
    {query.data && <p className="mt-3 text-[11px] text-muted">확인일 {new Date(query.data.fetchedAt).toLocaleDateString("ko-KR")} · {query.data.cache === "hit" ? "저장된 결과" : query.data.cache === "stale" ? "이전 결과" : "새로 검색한 결과"}{query.data.aiUsed ? " · AI 구조화" : ""}</p>}
  </section>;
}
