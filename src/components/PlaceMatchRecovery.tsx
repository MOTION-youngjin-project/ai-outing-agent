"use client";

import { useState } from "react";
import type { PlaceWithMeta } from "@/lib/clientApi";
import type { PlaceMatchCandidate } from "@/lib/services/places";

export function PlaceMatchRecovery({ runId, placeIndex, placeName, readOnly, onResolved }: {
  runId: string;
  placeIndex: number;
  placeName: string;
  readOnly: boolean;
  onResolved: (place: PlaceWithMeta) => void;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "failed">("idle");
  const [candidates, setCandidates] = useState<PlaceMatchCandidate[]>([]);

  async function retry(selectedExternalId?: string) {
    setStatus("loading");
    try {
      const response = await fetch(`/api/recommend/${encodeURIComponent(runId)}/place-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeIndex, ...(selectedExternalId ? { selectedExternalId } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (body.data.place) {
        setCandidates([]);
        onResolved(body.data.place);
        return;
      }
      setCandidates(body.data.candidates ?? []);
      setStatus("failed");
    } catch {
      setCandidates([]);
      setStatus("failed");
    }
  }

  return (
    <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900">
      <p>{placeName}의 장소 정보를 확인하지 못해 상세보기를 제공할 수 없습니다.</p>
      {!readOnly && (
        <button type="button" onClick={() => retry()} disabled={status === "loading"}
          className="mt-2 rounded-full border border-amber-300 bg-white px-3 py-1 font-semibold disabled:opacity-50">
          {status === "loading" ? "장소 찾는 중..." : "다시 찾기"}
        </button>
      )}
      {candidates.length > 0 && (
        <div className="mt-3 border-t border-amber-200 pt-2">
          <p className="mb-2 font-semibold">정확한 장소를 선택해 주세요.</p>
          <ul className="space-y-2">
            {candidates.map(candidate => (
              <li key={candidate.externalId}>
                <button type="button" disabled={status === "loading"} onClick={() => retry(candidate.externalId)}
                  className="w-full rounded-lg bg-white px-3 py-2 text-left shadow-sm disabled:opacity-50">
                  <span className="block font-semibold text-ink">{candidate.name}</span>
                  <span className="mt-0.5 block text-[11px] text-muted">{candidate.address || "주소 정보 없음"}</span>
                  {candidate.distanceM !== null && <span className="mt-0.5 block text-[11px] text-muted">코스의 인접 장소에서 직선거리 {(candidate.distanceM / 1000).toFixed(1)}km</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {status === "failed" && candidates.length === 0 && <p role="alert" className="mt-2">다시 검색했지만 일치하는 장소를 찾지 못했습니다.</p>}
    </div>
  );
}
