"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ScenePhotoAnalysis } from "./ScenePhotoAnalysis";
import type { SceneDraft } from "@/lib/scene-photo";
import type { ActiveTrip } from "@/lib/active-trip";
import { useActiveTrip } from "@/lib/active-trip-store";
import { SITUATION_LABELS, situationSchema, type TripSituationInput } from "@/lib/trip-situation";

const button = "rounded-lg border border-accent/30 px-3 py-2 text-sm disabled:opacity-50";

function SituationEditor({ trip, onClose, draft }: { trip: ActiveTrip; onClose: () => void; draft?: SceneDraft }) {
  const confirmSituation = useActiveTrip((s) => s.confirmSituation);
  const [reason, setReason] = useState<TripSituationInput["reason"]>(draft?.reason ?? trip.situation?.reason ?? "rain");
  const [detail, setDetail] = useState(draft?.detail ?? trip.situation?.detail ?? "");
  const [affectedStopId, setAffectedStopId] = useState(draft ? "" : trip.situation?.affectedStopId ?? "");
  const [minutes, setMinutes] = useState(String(trip.remainingMinutes));
  const [location, setLocation] = useState<TripSituationInput["currentLocation"] | null>(null);
  const [locating, setLocating] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(false);
  const request = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  function locate() {
    if (locating) return;
    setConfirmed(false); setLocation(null); setError("");
    if (!navigator.geolocation) { setError("현재 위치를 지원하지 않습니다. 현재 있는 코스 장소를 선택해 주세요."); return; }
    const token = ++request.current;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (!alive.current || token !== request.current) return;
      setLocating(false);
      setLocation({ latitude: coords.latitude, longitude: coords.longitude, accuracyM: Number.isFinite(coords.accuracy) ? coords.accuracy : null, source: "gps", stopId: null, capturedAt: new Date().toISOString() });
    }, (failure) => {
      if (!alive.current || token !== request.current) return;
      setLocating(false);
      setError(failure.code === 1 ? "위치 권한이 거부되었습니다. 권한을 허용하거나 현재 있는 코스 장소를 직접 선택해 주세요." : failure.code === 3 ? "현재 위치 조회 시간이 초과되었습니다. 다시 시도하거나 현재 장소를 선택해 주세요." : "현재 위치를 확인하지 못했습니다. 다시 시도하거나 현재 장소를 선택해 주세요.");
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }

  return <form aria-label="현장 상황 입력" className="mt-3 space-y-3" onSubmit={(event) => {
    event.preventDefault(); setError("");
    if (!confirmed || locating) { setError("현재 위치와 입력 내용을 확인해 주세요."); return; }
    const result = situationSchema.safeParse({ reason, detail, affectedStopId: affectedStopId || null, remainingMinutes: Number(minutes), currentLocation: location });
    if (!result.success) { setError(result.error.issues[0].message); return; }
    if (confirmSituation(trip.id, trip.revision, result.data)) onClose();
  }}>
    <fieldset><legend className="mb-2 text-sm font-medium">어떤 상황인가요?</legend><div className="flex flex-wrap gap-2">{Object.entries(SITUATION_LABELS).map(([value, label]) => <button type="button" key={value} className={`${button} ${reason === value ? "bg-mint-bg font-semibold" : ""}`} aria-pressed={reason === value} onClick={() => { setReason(value as TripSituationInput["reason"]); setConfirmed(false); }}>{label}</button>)}</div></fieldset>
    <label className="block text-sm">상황 설명{reason === "other" ? " (필수)" : " (선택)"}<textarea className="mt-1 w-full rounded border p-2" rows={3} maxLength={1000} required={reason === "other"} value={detail} onChange={(e) => { setDetail(e.target.value); setConfirmed(false); }} placeholder="예: 오래 걷기 힘들어서 가까운 곳에서 쉬고 싶어요." /></label>
    <label className="block text-sm">변경 대상 장소<select className="mt-1 w-full rounded border p-2" required={reason === "closed" || reason === "crowded"} value={affectedStopId} onChange={(e) => { setAffectedStopId(e.target.value); setConfirmed(false); }}><option value="">남은 일정 전체</option>{trip.stops.filter((s) => !s.visitedAt).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <p className="text-xs">휴무·혼잡은 직접 확인한 상황으로 기록됩니다. 이미 방문한 장소는 변경 대상에서 제외됩니다.</p>
    <label className="block text-sm">이번 일정의 남은 시간(분)<input className="ml-2 w-24 rounded border p-2" type="number" min="1" max="1440" step="1" required value={minutes} onChange={(e) => { setMinutes(e.target.value); setConfirmed(false); }} /></label>
    <button type="button" className={button} disabled={locating} onClick={locate}>{locating ? "위치 확인 중…" : "현재 위치 확인"}</button>
    <label className="block text-sm">또는 지금 있는 코스 장소<select className="mt-1 w-full rounded border p-2" disabled={locating} value={location?.source === "stop" ? location.stopId ?? "" : ""} onChange={(e) => {
      const stop = trip.stops.find((s) => s.id === e.target.value);
      setConfirmed(false); setError("");
      setLocation(stop && stop.latitude !== null && stop.longitude !== null ? { latitude: stop.latitude, longitude: stop.longitude, source: "stop", stopId: stop.id, accuracyM: null, capturedAt: new Date().toISOString() } : null);
    }}><option value="">현재 있는 장소를 선택해 주세요</option>{trip.stops.filter((s) => s.latitude !== null && s.longitude !== null).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <p className="text-xs">선택한 장소에 실제로 있을 때만 사용해 주세요. 현재 좌표와 상황은 이 기기에 저장됩니다.</p>
    {location && <p className="text-sm">현재 위치: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)} · {location.source === "gps" ? `GPS${location.accuracyM !== null ? ` (정확도 약 ${Math.round(location.accuracyM)}m)` : ""}` : "장소 직접 선택"}</p>}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={!location || locating} onChange={(e) => setConfirmed(e.target.checked)} />현재 위치·변경 사유·남은 시간을 확인했습니다.</label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex gap-2"><button className={button} disabled={!confirmed || locating}>상황 저장</button><button type="button" className={button} onClick={onClose}>취소</button></div>
  </form>;
}

export function TripSituationForm({ trip }: { trip: ActiveTrip }) {
  const pathname = usePathname();
  return <TripSituationContent key={pathname} trip={trip} />;
}

function TripSituationContent({ trip }: { trip: ActiveTrip }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SceneDraft | undefined>();
  const [draftVersion, setDraftVersion] = useState(0);
  if (trip.status !== "active") return null;
  return <section aria-label="현장 상황" className="my-3 rounded-xl border p-3">
    <h3 className="text-sm font-semibold">일정 변경 사유</h3>
    <ScenePhotoAnalysis onApply={(value) => { setDraft(value); setDraftVersion((v) => v + 1); setEditing(true); }} onReset={() => { if (draft) { setDraft(undefined); setEditing(false); } }} />
    <p className="mt-1 text-xs">현장 상황을 기록합니다. 기존 코스는 그대로 유지됩니다.</p>
    {trip.situation && <div className="mt-2 text-sm" role="status"><p>저장한 상황: {SITUATION_LABELS[trip.situation.reason]}</p>{trip.situation.detail && <p className="whitespace-pre-wrap break-words">{trip.situation.detail}</p>}<p>대상: {trip.stops.find((s) => s.id === trip.situation?.affectedStopId)?.name ?? "남은 일정 전체"} · 남은 시간 {trip.situation.remainingMinutes}분</p><p>위치: {trip.situation.currentLocation.latitude.toFixed(6)}, {trip.situation.currentLocation.longitude.toFixed(6)}</p></div>}
    {editing ? <SituationEditor key={draftVersion} trip={trip} draft={draft} onClose={() => { setEditing(false); setDraft(undefined); }} /> : <button className={`${button} mt-2`} onClick={() => setEditing(true)}>{trip.situation ? "현장 상황 수정" : "현장 상황 입력"}</button>}
  </section>;
}
