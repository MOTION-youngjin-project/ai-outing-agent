"use client";

import { useEffect, useRef, useState } from "react";
import { usePhotoPreferences } from "@/lib/photo-preferences-store";
import { useActiveTrip } from "@/lib/active-trip-store";
import type { PhotoPreferences } from "@/lib/photo-preferences";
import { photoCourseRequestSchema, photoCourseSchema, tripFromPhotoCourse, koreanDate, minuteLabel, type PhotoCourse, type PhotoCourseRequest } from "@/lib/photo-course";
import { ui } from "./tripUi";

type Origin = { id: string; name: string };
export function PhotoCoursePlanner({ origins }: { origins: Origin[] }) {
  const confirmed = usePhotoPreferences((s) => s.confirmed);
  return <section aria-label="포토 코스 생성" className={ui.panel}>
    <h2 className={ui.title}>촬영 취향으로 코스 만들기</h2>
    {confirmed ? <CourseEditor key={JSON.stringify(confirmed)} preferences={confirmed} origins={origins} /> : <p className={ui.text}>위에서 촬영 취향을 먼저 확정해 주세요.</p>}
  </section>;
}

function CourseEditor({ preferences, origins }: { preferences: PhotoPreferences; origins: Origin[] }) {
  const [title, setTitle] = useState("친구와 대구 사진 여행");
  const [date, setDate] = useState(() => koreanDate());
  const [time, setTime] = useState("14:00");
  const [duration, setDuration] = useState("240");
  const [mode, setMode] = useState<PhotoCourseRequest["transportMode"]>("walk");
  const [originId, setOriginId] = useState(origins[0].id);
  const [course, setCourse] = useState<PhotoCourse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const tripState = useActiveTrip();
  useEffect(() => { useActiveTrip.getState().hydrate(); return () => { pending.current?.abort(); pending.current = null; }; }, []);
  function input() { return { title, date, startTime: time, durationMinutes: Number(duration), transportMode: mode, originId, preferences }; }
  function invalidate() { pending.current?.abort(); pending.current = null; setCourse(null); setReviewed(false); setError(""); setBusy(false); }
  async function generate() {
    if (pending.current) return;
    const parsed = photoCourseRequestSchema.safeParse(input());
    if (!parsed.success) { setError("제목·방문 날짜·출발 시각·여행 시간(30~720분)을 확인해 주세요."); return; }
    setError(""); setCourse(null); setReviewed(false); setBusy(true);
    const controller = new AbortController(); pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch("/api/photo-courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "코스를 생성하지 못했습니다.");
      const result = photoCourseSchema.safeParse(data.course);
      if (!result.success || JSON.stringify(result.data.input) !== JSON.stringify(parsed.data)) throw new Error("코스 응답을 확인하지 못했습니다. 다시 생성해 주세요.");
      if (pending.current === controller && !controller.signal.aborted) setCourse(result.data);
    } catch (reason) {
      if (pending.current === controller) setError(controller.signal.aborted ? "코스 생성 시간이 초과되었습니다. 다시 시도해 주세요." : reason instanceof Error ? reason.message : "코스를 생성하지 못했습니다.");
    } finally { clearTimeout(timer); if (pending.current === controller) { pending.current = null; setBusy(false); } }
  }
  return <div className="flex flex-col gap-3">
    <form aria-label="포토 여행 조건" className="flex flex-col gap-3" onChange={invalidate} onSubmit={(event) => { event.preventDefault(); void generate(); }}>
      <label className={ui.label}>여행 제목<input className={ui.field} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required /></label>
      <label className={ui.label}>방문 날짜<input className={ui.field} type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
      <label className={ui.label}>출발 시각 (한국 시간)<input className={ui.field} type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></label>
      <label className={ui.label}>여행 시간(분)<input className={ui.field} type="number" min={30} max={720} value={duration} onChange={(e) => setDuration(e.target.value)} required /></label>
      <label className={ui.label}>이동수단<select className={ui.field} value={mode} onChange={(e) => setMode(e.target.value as PhotoCourseRequest["transportMode"])}><option value="walk">도보</option><option value="car">자동차</option><option value="public_transit">대중교통</option></select></label>
      <label className={ui.label}>출발 장소<select className={ui.field} value={originId} onChange={(e) => setOriginId(e.target.value)}>{origins.map((origin) => <option key={origin.id} value={origin.id}>{origin.name}</option>)}</select></label>
      <p className={ui.note}>선택한 장소에 도착한 시각부터 계획합니다. 자동차는 각 장소로 이동한 뒤 출발지로 복귀하며, 도보·대중교통은 마지막 촬영 장소에서 끝납니다.</p>
      <button className={ui.primary} disabled={busy}>{busy ? "코스 계산 중…" : "포토 코스 생성"}</button>
    </form>
    {busy && <p role="status" className={ui.text}>이동·체류 시간과 일몰 시각을 확인하고 있습니다.</p>}
    {error && <p role="alert" className={ui.error}>{error}</p>}
    {course && <section aria-label="포토 코스 제안" className={ui.sub}>
      <h3 className={ui.title}>{course.input.title}</h3>
      <p className={ui.text}>{course.input.date} · {course.input.startTime}~{minuteLabel(course.endMinute)} · 총 {course.totalMinutes}분</p>
      <p className={ui.text}>출발: {course.origin.name} · 계산한 일몰 약 {minuteLabel(course.sunsetMinute)}</p>
      <p className={ui.note}>이동 시간은 참고값입니다. 도보 경로 조회 실패 시 거리로 추정하며, 자동차·대중교통은 현재 조회값으로 방문일 교통·배차를 보장하지 않습니다.</p>
      <ol className="flex flex-col gap-2">{course.stops.map((stop, i) => <li key={stop.place.id} className={`${ui.text} flex flex-col gap-1 rounded-xl bg-white p-3`}>
        <h4 className="text-[14px] font-bold text-ink">{i + 1}. {stop.place.name} · {minuteLabel(stop.arrivalMinute)}~{minuteLabel(stop.departureMinute)}</h4>
        <p>이동 {stop.travelMinutes}분 · 대기 {stop.waitMinutes}분 · 촬영 태그 {stop.matchTags.join(" · ")}</p>
        <p>{stop.place.address}</p><p>{stop.place.hours}</p>
        <ul className="list-disc pl-5">{stop.place.shootingTips.map((tip) => <li key={tip}>{tip}</li>)}</ul><p>{stop.place.visitNotice}</p>
        <div className={ui.row}>{stop.place.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="text-[12px] font-medium text-accent underline underline-offset-2">{source.label}</a>)}</div>
      </li>)}</ol>
      {course.input.transportMode === "car" && <p className={ui.text}>마지막 → {course.origin.name} 복귀 {course.returnMinutes}분 포함</p>}
      <details><summary className="cursor-pointer text-[13px] font-medium text-ink-soft">시간표와 방문 전 확인 사항</summary><ul className={`${ui.note} list-disc space-y-1 pl-5`}>{course.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details>
      <label className={ui.check}><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />시간표·이동 추정·방문일 운영 및 촬영 조건을 확인했습니다.</label>
      <p className={ui.note}>여행 시작 시 확정 취향·설명과 코스가 이 기기에 저장됩니다. 방문 당일 계획 시각 전후 15분 이내에 시작할 수 있습니다. 주차 위치는 시작 후 직접 저장해 주세요.</p>
      <button className={ui.primary} disabled={!reviewed || !tripState.hydrated || !!tripState.error || tripState.trip?.status === "active"} onClick={() => {
        try {
          if (!reviewed || JSON.stringify(usePhotoPreferences.getState().confirmed) !== JSON.stringify(preferences)) throw new Error("촬영 취향을 다시 확정해 주세요.");
          const next = tripFromPhotoCourse(course, photoCourseRequestSchema.parse(input()));
          tripState.start(next);
          if (useActiveTrip.getState().trip?.id === next.id) { setCourse(null); setReviewed(false); }
        } catch (reason) { setError(reason instanceof Error ? reason.message : "여행을 시작하지 못했습니다."); }
      }}>이 코스로 여행 시작</button>
      {tripState.trip?.status === "active" && <p className={ui.text}>진행 중인 여행을 먼저 종료해 주세요.</p>}
      {tripState.error && <p role="alert" className={ui.error}>{tripState.error}</p>}
    </section>}
  </div>;
}
