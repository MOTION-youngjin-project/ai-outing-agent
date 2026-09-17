"use client";

import { useEffect, useState } from "react";
import { useActiveTrip } from "@/lib/active-trip-store";
import { ParkingLocationPicker } from "./ParkingLocationPicker";
import { TripSituationForm } from "./TripSituationForm";
import { TripReplanPanel } from "./TripReplanPanel";
import { TripRouteMap } from "./TripRouteMap";

const button = "rounded-lg border border-accent/30 px-3 py-2 text-sm disabled:opacity-50";

export function ActiveTripPanel() {
  const { trip, hydrated, error, hydrate, change, clear } = useActiveTrip();
  const [editingTime, setEditingTime] = useState(false);
  const [showRoute, setShowRoute] = useState(false);
  useEffect(() => { hydrate(); }, [hydrate]);
  if (!hydrated || (!trip && !error)) return null;
  return <section aria-label="진행 중 여행" className="mx-5 my-3 rounded-2xl border border-accent/30 bg-white p-4 text-ink">
    <h2 className="font-bold">{trip?.status === "completed" ? "종료한 여행" : "진행 중 여행"}</h2>
    <p className="mt-1 text-xs text-muted">이 기기에만 저장됩니다. 공용 기기에서는 사용 후 기록을 삭제해 주세요.</p>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    {trip && <>
      <p className="mt-2 font-medium">{trip.title}</p>
      {trip.photoTaste && <p className="text-sm">촬영 취향: {trip.photoTaste.tags.join(" · ")}{trip.photoTaste.note ? ` · ${trip.photoTaste.note}` : ""}</p>}
      <p className="text-sm">방문 {trip.stops.filter((s) => s.visitedAt).length}/{trip.stops.length}곳 · 남은 시간 {trip.remainingMinutes}분</p>
      <p className="text-xs text-muted">남은 시간은 자동 차감되지 않습니다. 일정 변경 전 확인해 주세요.</p>
      <ol className="my-3 space-y-2">{trip.stops.map((stop) => <li key={stop.id}>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!stop.visitedAt} disabled={trip.status !== "active"} onChange={() => change({ stopId: stop.id })} />{stop.name}{stop.visitedAt ? " · 방문 완료" : ""}</label>
        {stop.photoGuide && <details className="ml-5 text-xs"><summary>촬영 안내 · 최초 계획 {stop.photoGuide.plannedTime}</summary><ul className="list-disc pl-4">{stop.photoGuide.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul><p>{stop.photoGuide.notice}</p><p>최초 촬영 계획이며 일정 변경 후 시간은 다시 확인해 주세요.</p></details>}
      </li>)}</ol>
      <ParkingLocationPicker key={trip.id} trip={trip} />
      {trip.parking && !trip.appliedRoute && <div className="my-3"><button className={button} onClick={() => setShowRoute(!showRoute)}>{showRoute ? "진행 코스 지도 닫기" : "진행 코스 지도 보기"}</button>{showRoute && <TripRouteMap stops={trip.stops} parking={trip.parking} mapKey={`${trip.id}:${trip.revision}`} />}</div>}
      <TripSituationForm key={`${trip.id}:${trip.revision}`} trip={trip} />
      {trip.appliedRoute && trip.parking && <div className="my-3" aria-label="적용된 변경 코스"><h3 className="font-semibold">변경 코스 적용 완료</h3><p className="text-sm">{trip.appliedRoute.explanation}</p><p className="text-sm">적용 당시 예상 총 {trip.appliedRoute.estimatedMinutes}분</p><ul className="list-disc pl-4 text-xs">{trip.appliedRoute.warnings.map((w) => <li key={w}>{w}</li>)}</ul><TripRouteMap stops={trip.stops} parking={trip.parking} origin={trip.appliedRoute.origin} mapKey={`${trip.id}:${trip.revision}`} /></div>}
      <TripReplanPanel key={`replan:${trip.id}:${trip.revision}`} trip={trip} />
      {trip.status === "active" && <div className="flex flex-wrap gap-2">
        <button className={button} onClick={() => setEditingTime(!editingTime)}>남은 시간 수정</button>
        <button className={button} onClick={() => { change({ finish: true }); setEditingTime(false); }}>여행 종료</button>
      </div>}
      {editingTime && trip.status === "active" && <form className="mt-2 flex gap-2" onSubmit={(event) => {
        event.preventDefault();
        const minutes = Number(new FormData(event.currentTarget).get("minutes"));
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return;
        change({ remainingMinutes: minutes }); setEditingTime(false);
      }}><label className="text-sm">남은 시간(분)<input className="ml-2 w-20 rounded border p-2" name="minutes" type="number" min="1" max="1440" required defaultValue={trip.remainingMinutes} /></label><button className={button}>저장</button></form>}
    </>}
    <button className={`${button} mt-3`} onClick={() => { if (window.confirm("이 기기의 여행 기록을 삭제할까요?")) { clear(); setEditingTime(false); } }}>여행 기록 삭제</button>
  </section>;
}
