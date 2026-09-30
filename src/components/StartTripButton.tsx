"use client";

import { useState } from "react";
import type { RecommendResult } from "@/lib/clientApi";
import { useActiveTrip } from "@/lib/active-trip-store";
import type { ActiveTrip } from "@/lib/active-trip";
import { Icon } from "./Icon";
import { ui } from "./tripUi";

const MODES: { value: ActiveTrip["transportMode"]; label: string }[] = [
  { value: "walk", label: "도보" },
  { value: "car", label: "자동차" },
  { value: "public_transit", label: "대중교통" },
];

export function StartTripButton({ recommendation }: { recommendation: RecommendResult }) {
  const { trip, hydrated, error, start } = useActiveTrip();
  const [minutes, setMinutes] = useState("180");
  const [mode, setMode] = useState<ActiveTrip["transportMode"]>("walk");
  if (recommendation.needsMoreInfo || !recommendation.places?.length || recommendation.isOwner === false) return null;
  const validTime = Number.isInteger(Number(minutes)) && Number(minutes) >= 1 && Number(minutes) <= 1440;
  const modeIndex = MODES.findIndex((m) => m.value === mode);
  return <section className={`${ui.panel} sk-enter`}>
    <h2 className={ui.title}>이 코스로 여행하기</h2>
    <div role="radiogroup" aria-label="이동수단" className="sk-seg" style={{ "--n": MODES.length, "--i": modeIndex } as React.CSSProperties}>
      <span aria-hidden className="sk-seg-pill" />
      {MODES.map((m) => (
        <button key={m.value} type="button" role="radio" aria-checked={mode === m.value} onClick={() => setMode(m.value)} className={`sk-seg-btn ${mode === m.value ? "sk-seg-on" : ""}`}>
          {m.label}
        </button>
      ))}
    </div>
    <div className="flex items-end gap-2">
      <label className={`${ui.label} flex-1`}>남은 시간(분)<input className={ui.field} type="number" min="1" max="1440" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
      <button className={ui.primary} disabled={!hydrated || !!error || trip?.status === "active" || !validTime} onClick={() => {
        const now = new Date().toISOString();
        start({ version: 1, id: crypto.randomUUID(), sourceRunId: recommendation.agentRunId, title: recommendation.places!.map((p) => p.name).join(" → ").slice(0, 300), revision: 0, status: "active", startedAt: now, updatedAt: now, remainingMinutes: Number(minutes), transportMode: mode,
          stops: recommendation.places!.map((p) => ({ id: crypto.randomUUID(), name: p.name, address: p.address ?? null, latitude: p.latitude ?? null, longitude: p.longitude ?? null, visitedAt: null, sourceId: p.placeId ? `db:${p.placeId}` : null, category: p.category ?? null, tags: p.tags ?? [], reason: p.reason?.slice(0, 2000), operatingHours: p.operatingHours?.slice(0, 1000) })),
        });
      }}><Icon name="arrowUpRight" className="h-4 w-4" />{trip?.status === "active" ? "여행 진행 중" : "여행 시작"}</button>
    </div>
    {trip?.status === "active" && <p className={ui.note}>진행 중인 여행을 종료한 후 새 여행을 시작할 수 있습니다.</p>}
  </section>;
}
