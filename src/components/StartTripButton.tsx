"use client";

import { useState } from "react";
import type { RecommendResult } from "@/lib/clientApi";
import { useActiveTrip } from "@/lib/active-trip-store";
import type { ActiveTrip } from "@/lib/active-trip";

export function StartTripButton({ recommendation }: { recommendation: RecommendResult }) {
  const { trip, hydrated, error, start } = useActiveTrip();
  const [minutes, setMinutes] = useState("180");
  const [mode, setMode] = useState<ActiveTrip["transportMode"]>("walk");
  if (recommendation.needsMoreInfo || !recommendation.places?.length || recommendation.isOwner === false) return null;
  const validTime = Number.isInteger(Number(minutes)) && Number(minutes) >= 1 && Number(minutes) <= 1440;
  return <section className="rounded-2xl border border-accent/30 bg-white p-4">
    <h2 className="font-semibold">이 코스로 여행하기</h2>
    <div className="my-2 flex flex-wrap gap-3 text-sm">
      <label>남은 시간(분)<input className="ml-2 w-20 rounded border p-2" type="number" min="1" max="1440" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
      <label>이동수단<select className="ml-2 rounded border p-2" value={mode} onChange={(e) => setMode(e.target.value as ActiveTrip["transportMode"])}><option value="walk">도보</option><option value="car">자동차</option><option value="public_transit">대중교통</option></select></label>
    </div>
    <button className="rounded-lg bg-accent px-4 py-2 text-sm text-white disabled:opacity-50" disabled={!hydrated || !!error || trip?.status === "active" || !validTime} onClick={() => {
      const now = new Date().toISOString();
      start({ version: 1, id: crypto.randomUUID(), sourceRunId: recommendation.agentRunId, title: recommendation.places!.map((p) => p.name).join(" → ").slice(0, 300), revision: 0, status: "active", startedAt: now, updatedAt: now, remainingMinutes: Number(minutes), transportMode: mode,
        stops: recommendation.places!.map((p) => ({ id: crypto.randomUUID(), name: p.name, address: p.address ?? null, latitude: p.latitude ?? null, longitude: p.longitude ?? null, visitedAt: null, sourceId: p.placeId ? `db:${p.placeId}` : null, category: p.category ?? null, tags: p.tags ?? [], reason: p.reason?.slice(0, 2000), operatingHours: p.operatingHours?.slice(0, 1000) })),
      });
    }}>{trip?.status === "active" ? "여행 진행 중" : "여행 시작"}</button>
    {trip?.status === "active" && <p className="mt-2 text-xs">진행 중인 여행을 종료한 후 새 여행을 시작할 수 있습니다.</p>}
  </section>;
}
