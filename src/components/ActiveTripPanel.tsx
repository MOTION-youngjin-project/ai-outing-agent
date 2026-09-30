"use client";

import { useEffect, useState } from "react";
import { useActiveTrip } from "@/lib/active-trip-store";
import { ParkingLocationPicker } from "./ParkingLocationPicker";
import { TripSituationForm } from "./TripSituationForm";
import { TripReplanPanel } from "./TripReplanPanel";
import { TripRouteMap } from "./TripRouteMap";
import { Icon } from "./Icon";
import { ui } from "./tripUi";

export function ActiveTripPanel() {
  const { trip, hydrated, error, hydrate, change, clear } = useActiveTrip();
  const [editingTime, setEditingTime] = useState(false);
  const [showRoute, setShowRoute] = useState(false);
  // 모든 화면 맨 위에 붙는 패널이라 기본은 한 줄 요약이다 — 펼쳐 둔 채면 어느 화면을 가도
  // 본문이 패널 아래로 한참 밀려났다.
  const [open, setOpen] = useState(false);
  useEffect(() => { hydrate(); }, [hydrate]);
  if (!hydrated || (!trip && !error)) return null;
  const visited = trip ? trip.stops.filter((s) => s.visitedAt).length : 0;
  const next = trip?.stops.find((s) => !s.visitedAt);
  return <section aria-label="진행 중 여행" className={`${ui.panel} mx-5 mb-1 mt-[calc(0.75rem+env(safe-area-inset-top))]`}>
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 text-left">
      <span className="sk-slot h-9 w-9 rounded-xl border-transparent bg-mint-bg text-accent">
        <Icon name="walk" className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold text-accent">{trip?.status === "completed" ? "종료한 여행" : "진행 중 여행"}</span>
        <span className="block truncate text-[14px] font-bold text-ink">
          {trip ? (trip.status === "active" && next ? `다음: ${next.name}` : trip.title) : "여행 기록을 불러오지 못했어요"}
        </span>
      </span>
      {trip && <span className="shrink-0 text-right text-[12px] text-muted">방문 {visited}/{trip.stops.length}<br />남은 {trip.remainingMinutes}분</span>}
      <Icon name="next" className={`h-4 w-4 shrink-0 text-slate-300 transition-transform ${open ? "rotate-90" : ""}`} />
    </button>
    {trip && trip.stops.length > 0 && (
      <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-page">
        <span className="block h-full rounded-full bg-cta transition-[width]" style={{ width: `${(visited / trip.stops.length) * 100}%` }} />
      </span>
    )}
    {error && <p role="alert" className={ui.error}>{error}</p>}
    {open && trip && <>
      <p className={ui.note}>이 기기에만 저장됩니다. 공용 기기에서는 사용 후 기록을 삭제해 주세요. 남은 시간은 자동 차감되지 않으니 일정 변경 전 확인해 주세요.</p>
      {trip.photoTaste && <p className={ui.text}>촬영 취향: {trip.photoTaste.tags.join(" · ")}{trip.photoTaste.note ? ` · ${trip.photoTaste.note}` : ""}</p>}
      <ol className="flex flex-col gap-1">{trip.stops.map((stop, i) => <li key={stop.id} className="rounded-xl px-1 py-1.5">
        <label className="flex items-center gap-2.5 text-[14px] text-ink">
          <input type="checkbox" className="h-4 w-4 accent-[var(--sk-cta)]" checked={!!stop.visitedAt} disabled={trip.status !== "active"} onChange={() => change({ stopId: stop.id })} />
          <span className="sk-slot h-6 w-6 rounded-lg border-transparent bg-mint-bg text-[11px] text-accent">{i + 1}</span>
          <span className={`min-w-0 flex-1 truncate ${stop.visitedAt ? "text-muted line-through" : ""}`}>{stop.name}</span>
          {stop.visitedAt && <span className="shrink-0 text-[11px] font-semibold text-accent">방문 완료</span>}
        </label>
        {stop.photoGuide && <details className={`${ui.note} ml-[3.25rem] mt-1`}><summary className="cursor-pointer">촬영 안내 · 최초 계획 {stop.photoGuide.plannedTime}</summary><ul className="list-disc pl-4">{stop.photoGuide.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul><p>{stop.photoGuide.notice}</p><p>최초 촬영 계획이며 일정 변경 후 시간은 다시 확인해 주세요.</p></details>}
      </li>)}</ol>
      <ParkingLocationPicker key={trip.id} trip={trip} />
      {trip.parking && !trip.appliedRoute && <div className="flex flex-col gap-2"><button className={ui.btn} onClick={() => setShowRoute(!showRoute)}><Icon name="pin" className="h-4 w-4" />{showRoute ? "진행 코스 지도 닫기" : "진행 코스 지도 보기"}</button>{showRoute && <TripRouteMap stops={trip.stops} parking={trip.parking} mapKey={`${trip.id}:${trip.revision}`} />}</div>}
      <TripSituationForm key={`${trip.id}:${trip.revision}`} trip={trip} />
      {trip.appliedRoute && trip.parking && <div className={ui.sub} aria-label="적용된 변경 코스"><h3 className={ui.heading}>변경 코스 적용 완료</h3><p className={ui.text}>{trip.appliedRoute.explanation}</p><p className={ui.text}>적용 당시 예상 총 {trip.appliedRoute.estimatedMinutes}분</p><ul className={`${ui.note} list-disc pl-4`}>{trip.appliedRoute.warnings.map((w) => <li key={w}>{w}</li>)}</ul><TripRouteMap stops={trip.stops} parking={trip.parking} origin={trip.appliedRoute.origin} mapKey={`${trip.id}:${trip.revision}`} /></div>}
      <TripReplanPanel key={`replan:${trip.id}:${trip.revision}`} trip={trip} />
      {trip.status === "active" && <div className={ui.row}>
        <button className={ui.btn} onClick={() => setEditingTime(!editingTime)}><Icon name="clock" className="h-4 w-4" />남은 시간 수정</button>
        <button className={ui.btn} onClick={() => { change({ finish: true }); setEditingTime(false); }}><Icon name="checkCircle" className="h-4 w-4" />여행 종료</button>
      </div>}
      {editingTime && trip.status === "active" && <form className="flex items-end gap-2" onSubmit={(event) => {
        event.preventDefault();
        const minutes = Number(new FormData(event.currentTarget).get("minutes"));
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return;
        change({ remainingMinutes: minutes }); setEditingTime(false);
      }}><label className={`${ui.label} flex-1`}>남은 시간(분)<input className={ui.field} name="minutes" type="number" min="1" max="1440" required defaultValue={trip.remainingMinutes} /></label><button className={ui.primary}>저장</button></form>}
    </>}
    {(open || !trip) && <button className={`${ui.quiet} self-start`} onClick={() => { if (window.confirm("이 기기의 여행 기록을 삭제할까요?")) { clear(); setEditingTime(false); } }}>여행 기록 삭제</button>}
  </section>;
}
