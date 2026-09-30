"use client";

import { useEffect, useRef, useState } from "react";
import { PhotoInput } from "./PhotoInput";
import type { PhotoSelection } from "@/lib/photo-input";
import { PHOTO_TAGS } from "@/lib/photo-places";
import { PHOTO_FOCUS_LABELS, photoPreferencesSchema, photoTasteAnalysisSchema, type PhotoPreferences, type PhotoTasteAnalysis } from "@/lib/photo-preferences";
import { usePhotoPreferences } from "@/lib/photo-preferences-store";

const button = "rounded-lg border border-accent/30 px-3 py-2 text-sm disabled:opacity-50";

export function PhotoPreferenceEditor() {
  const { confirmed, confirm, clear } = usePhotoPreferences();
  const [photo, setPhoto] = useState<PhotoSelection | null>(null);
  const [tags, setTags] = useState<PhotoPreferences["tags"]>(confirmed?.tags ?? []);
  const [focus, setFocus] = useState<PhotoPreferences["focus"]>(confirmed?.focus ?? "overall");
  const [note, setNote] = useState(confirmed?.note ?? "");
  const [analysis, setAnalysis] = useState<PhotoTasteAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);

  function resetPhoto(next: PhotoSelection | null) {
    pending.current?.abort(); pending.current = null;
    setPhoto(next); setAnalysis(null); setTags([]); setFocus("overall"); setNote("");
    setBusy(false); setError(""); clear();
  }
  async function analyze() {
    if (!photo || pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setAnalysis(null); setError(""); clear();
    const timer = setTimeout(() => controller.abort(), 40000);
    try {
      const response = await fetch("/api/photo-preferences/analyze", { method: "POST", headers: { "Content-Type": photo.mimeType }, body: photo.file, signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "사진 분석에 실패했습니다. 직접 선택해 주세요.");
      const result = photoTasteAnalysisSchema.safeParse(data.analysis);
      if (!result.success) throw new Error("분석 결과를 확인하지 못했습니다. 촬영 취향을 직접 선택해 주세요.");
      if (pending.current === controller && !controller.signal.aborted) {
        setAnalysis(result.data); setTags(result.data.readable ? [...new Set(result.data.tags)] : []);
      }
    } catch (reason) {
      if (pending.current === controller) setError(controller.signal.aborted ? "사진 분석 시간이 초과되었습니다. 다시 시도하거나 직접 선택해 주세요." : reason instanceof Error ? reason.message : "사진 분석에 실패했습니다. 직접 선택해 주세요.");
    } finally {
      clearTimeout(timer);
      if (pending.current === controller) { pending.current = null; setBusy(false); }
    }
  }

  return <section aria-label="촬영 취향 확인" className="space-y-3">
    <PhotoInput title="참고 사진" onChange={resetPhoto} analysisEnabled />
    <button type="button" className={button} disabled={!photo || busy} onClick={analyze}>{busy ? "사진 분석 중…" : "사진 분석"}</button>
    {busy && <p role="status" className="text-sm">배경·분위기·구도를 분석하고 있습니다. 사진을 삭제하면 취소됩니다.</p>}
    {analysis && <div className="space-y-1 rounded-xl border p-3 text-sm">
      <h2 className="font-semibold">사진 취향 제안 · 확인 전</h2>
      {analysis.readable ? <><p>배경: {analysis.background}</p><p>분위기: {analysis.mood}</p><p>구도: {analysis.composition}</p></> : <p>사진에서 취향을 파악하기 어렵습니다. 아래에서 직접 선택해 주세요.</p>}
      <p>{analysis.uncertainty}</p>
    </div>}
    <form aria-label="촬영 취향 입력" className="space-y-3 rounded-xl border p-4" onSubmit={(event) => {
      event.preventDefault(); if (busy) return;
      const result = photoPreferencesSchema.safeParse({ tags, focus, note });
      if (!result.success) { setError(result.error.issues[0].message); return; }
      confirm(result.data); setError("");
    }}>
      <fieldset disabled={busy} className="space-y-3">
        <legend className="font-semibold">원하는 촬영 취향</legend>
        <p className="text-sm">태그를 1개 이상 선택하세요. 사진 없이도 직접 선택할 수 있습니다.</p>
        <div className="flex flex-wrap gap-2">{PHOTO_TAGS.map((tag) => <label key={tag} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={tags.includes(tag)} onChange={() => { clear(); setError(""); setTags(tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]); }} />{tag}</label>)}</div>
        <label className="block text-sm">가장 중요한 요소<select className="mt-1 block w-full rounded border p-2" value={focus} onChange={(e) => { clear(); setFocus(e.target.value as PhotoPreferences["focus"]); }}>{Object.entries(PHOTO_FOCUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="block text-sm">선호 설명 (선택, 500자 이내)<textarea className="mt-1 w-full rounded border p-2" rows={3} maxLength={500} value={note} onChange={(e) => { clear(); setNote(e.target.value); }} placeholder="예: 색감보다 배경이 좋아요. 친구와 함께 찍고 싶어요." /></label>
        <button className={button} disabled={!!confirmed}>이 취향으로 확정</button>
        <button type="button" className={`${button} ml-2`} onClick={() => { clear(); setTags([]); setFocus("overall"); setNote(""); setAnalysis(null); setError(""); }}>취향 초기화</button>
      </fieldset>
    </form>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {confirmed && <div role="status" className="space-y-1 rounded-xl bg-mint-bg p-4 text-sm"><p className="font-semibold">촬영 취향을 확정했습니다.</p><p>{confirmed.tags.join(" · ")}</p><p>중요한 요소: {PHOTO_FOCUS_LABELS[confirmed.focus]}</p>{confirmed.note && <p className="whitespace-pre-wrap break-words">{confirmed.note}</p>}</div>}
    <p className="text-xs text-muted">확정한 태그와 설명은 같은 탭에서 화면을 이동해도 유지되며, 새로고침하거나 취향을 초기화하면 삭제됩니다. 사진 교체·삭제 또는 취향 수정 후에는 다시 확정해 주세요. 아래에서 이 취향으로 코스를 만들 수 있습니다.</p>
  </section>;
}
