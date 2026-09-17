"use client";

import { useEffect, useRef, useState } from "react";
import type { ActiveTrip } from "@/lib/active-trip";
import { useActiveTrip } from "@/lib/active-trip-store";
import { proposalSchema, validateReplanTrip, type ReplanProposal } from "@/lib/trip-replan";
import { TripRouteMap } from "./TripRouteMap";

const button = "rounded-lg border border-accent/30 px-3 py-2 text-sm disabled:opacity-50";

export function TripReplanPanel({ trip }: { trip: ActiveTrip }) {
  const accept = useActiveTrip((s) => s.acceptReplan);
  const [proposal, setProposal] = useState<ReplanProposal | null>(null);
  const [visitMinutes, setVisitMinutes] = useState("20");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);

  async function recommend() {
    if (request.current) return;
    setError("");
    try { validateReplanTrip(trip); } catch (e) { setError((e as Error).message); return; }
    const minutes = Number(visitMinutes);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 120) { setError("장소당 체류 시간을 5~120분의 정수로 입력해 주세요."); return; }
    const controller = new AbortController(); request.current = controller;
    const timer = setTimeout(() => controller.abort("timeout"), 180000);
    setLoading(true); setProposal(null);
    try {
      const response = await fetch("/api/trips/replan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trip, visitMinutes: minutes }), signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "재추천하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      const result = proposalSchema.safeParse(body.proposal);
      if (!result.success) throw new Error("변경안 형식을 확인하지 못했습니다. 기존 코스는 유지됩니다.");
      const current = useActiveTrip.getState().trip;
      if (controller.signal.aborted || current?.id !== trip.id || current.revision !== trip.revision) return;
      if (result.data.tripId !== trip.id || result.data.baseRevision !== trip.revision) throw new Error("여행 조건이 다른 변경안입니다. 다시 추천해 주세요.");
      setProposal(result.data);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "재추천 요청에 실패했습니다.");
      else if (controller.signal.reason === "timeout") setError("재추천 시간이 오래 걸립니다. 기존 코스는 유지됩니다. 잠시 후 다시 시도해 주세요.");
    } finally { clearTimeout(timer); if (request.current === controller) request.current = null; if (!controller.signal.aborted || controller.signal.reason === "timeout") setLoading(false); }
  }
  if (trip.status !== "active") return null;
  return <section aria-label="남은 코스 재추천" className="my-3 rounded-xl border p-3">
    <h3 className="font-semibold">남은 코스 재추천</h3>
    {!trip.parking && <p className="mt-2 text-sm">복귀할 주차 위치를 먼저 저장해 주세요.</p>}
    {!trip.situation && <p className="mt-2 text-sm">현장 상황과 현재 위치를 확인하고 저장해 주세요.</p>}
    <label className="mt-2 block text-sm">장소당 머무를 시간(분)<input className="ml-2 w-20 rounded border p-2" type="number" min="5" max="120" value={visitMinutes} disabled={loading || !!proposal} onChange={(e) => setVisitMinutes(e.target.value)} /></label>
    <p className="my-2 text-xs">머무를 시간과 주차장 복귀 시간을 함께 반영합니다. 변경안을 수락하기 전에는 코스가 바뀌지 않습니다.</p>
    {!proposal && <button className={button} disabled={loading || !trip.parking || !trip.situation} onClick={recommend}>{loading ? "대체 장소와 복귀 시간 확인 중…" : "남은 코스 다시 추천"}</button>}
    {loading && <button className={`${button} ml-2`} onClick={() => { request.current?.abort(); request.current = null; setLoading(false); }}>요청 취소</button>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    {proposal && <div className="mt-3 space-y-3" aria-label="변경 코스 확인">
      <div><h4 className="font-medium">기존 남은 코스</h4><p className="text-sm">{trip.stops.filter((s) => !s.visitedAt).map((s) => s.name).join(" → ") || "방문할 장소 없음"} → {trip.parking?.label}</p></div>
      <div><h4 className="font-medium">제안 코스</h4><p className="text-sm">현재 위치 → {proposal.remainingStops.length ? `${proposal.remainingStops.map((s) => s.name).join(" → ")} → ` : ""}{proposal.parking.label} (주차장 복귀)</p></div>
      <p className="text-sm">{proposal.explanation}</p>
      <p className="text-sm font-medium">예상 총 {proposal.estimatedMinutes}분 = 이동·복귀 {proposal.travelMinutes}분 + 체류 {proposal.visitMinutes}분</p>
      {proposal.remainingStops.map((s) => <div key={s.id} className="text-sm"><p className="font-medium">{s.name}</p><p>{s.reason}</p><p>{s.address}</p>{s.operatingHours && <p>참고 운영시간: {s.operatingHours}</p>}</div>)}
      <ul className="list-disc space-y-1 pl-4 text-xs">{proposal.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      <p className="text-xs">{new Date(proposal.expiresAt).toLocaleTimeString("ko-KR")}까지 유효합니다. 수락 시 위치와 여행 조건을 다시 확인합니다.</p>
      <TripRouteMap stops={proposal.remainingStops} parking={proposal.parking} origin={proposal.origin} mapKey={proposal.id} />
      <div className="flex gap-2"><button className={button} onClick={() => { if (accept(proposal)) setProposal(null); }}>이 코스로 변경</button><button className={button} onClick={() => setProposal(null)}>기존 코스 유지</button></div>
    </div>}
  </section>;
}
