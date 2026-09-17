"use client";

import { useEffect, useRef, useState } from "react";
import { PhotoInput } from "./PhotoInput";
import type { PhotoSelection } from "@/lib/photo-input";
import { scenePhotoSchema, type ScenePhotoAnalysis as Analysis, type SceneDraft } from "@/lib/scene-photo";
import { SITUATION_LABELS } from "@/lib/trip-situation";

export function ScenePhotoAnalysis({ onApply, onReset }: { onApply: (draft: SceneDraft) => void; onReset: () => void }) {
  const [photo, setPhoto] = useState<PhotoSelection | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);

  function reset(next: PhotoSelection | null) {
    pending.current?.abort(); pending.current = null;
    setPhoto(next); setAnalysis(null); setBusy(false); setError(""); onReset();
  }
  async function analyze() {
    if (!photo || busy) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setAnalysis(null); setError(""); onReset();
    const timer = setTimeout(() => controller.abort(), 40000);
    try {
      const response = await fetch("/api/trips/scene-photo", { method: "POST", headers: { "Content-Type": photo.mimeType }, body: photo.file, signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "사진 분석에 실패했습니다.");
      const result = scenePhotoSchema.safeParse(data.analysis);
      if (!result.success) throw new Error("분석 결과를 확인하지 못했습니다. 다시 시도하거나 직접 입력해 주세요.");
      if (pending.current === controller && !controller.signal.aborted) setAnalysis(result.data);
    } catch (reason) {
      if (pending.current === controller) setError(controller.signal.aborted ? "사진 분석 시간이 초과되었습니다. 다시 시도하거나 직접 입력해 주세요." : reason instanceof Error ? reason.message : "사진 분석에 실패했습니다. 직접 입력해 주세요.");
    } finally {
      clearTimeout(timer);
      if (pending.current === controller) { pending.current = null; setBusy(false); }
    }
  }
  return <div className="space-y-3" role="group" aria-label="현장 사진 분석">
    <PhotoInput title="현장 사진" onChange={reset} analysisEnabled />
    <button type="button" className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" disabled={!photo || busy} onClick={analyze}>{busy ? "사진 분석 중…" : "사진 분석"}</button>
    {busy && <p role="status" className="text-sm">안내문과 현장 상황을 읽고 있습니다. 사진을 삭제하면 분석을 취소합니다.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {analysis && <div className="space-y-2 rounded-lg border p-3">
      <h4 className="font-semibold">분석 결과 · 확인 전 초안</h4>
      <p className="whitespace-pre-wrap text-sm">사진에서 읽은 내용: {analysis.observedText || "읽을 수 있는 안내문이 없습니다."}</p>
      <p className="text-sm">{analysis.uncertainty}</p>
      <p className="text-xs">사진만으로 현재 휴무·혼잡 여부를 확정할 수 없습니다. 날짜와 대상 장소를 직접 확인해 주세요.</p>
      {analysis.readable ? <><p className="text-sm">제안: {SITUATION_LABELS[analysis.reason]}</p><p className="whitespace-pre-wrap text-sm">{analysis.detail}</p><button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => onApply({ reason: analysis.reason, detail: analysis.detail })}>상황 입력에서 확인·수정</button></> : <p className="text-sm">상황을 판독하기 어렵습니다. 다른 사진을 선택하거나 아래에서 직접 입력해 주세요.</p>}
    </div>}
  </div>;
}
