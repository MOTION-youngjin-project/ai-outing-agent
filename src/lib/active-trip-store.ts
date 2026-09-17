"use client";

import { create } from "zustand";
import { activeTripSchema, restoreTrip, TRIP_STORAGE_KEY, updateTrip, type ActiveTrip, type ParkingLocation } from "./active-trip";
import { situationSchema, type TripSituationInput } from "./trip-situation";
import { applyReplan, type ReplanProposal } from "./trip-replan";

interface TripState {
  trip: ActiveTrip | null;
  hydrated: boolean;
  error: string;
  hydrate: () => void;
  start: (trip: ActiveTrip) => void;
  change: (change: Parameters<typeof updateTrip>[1]) => void;
  clear: () => void;
  setParking: (tripId: string, parking: ParkingLocation | null) => boolean;
  confirmSituation: (tripId: string, baseRevision: number, input: TripSituationInput) => boolean;
  acceptReplan: (proposal: ReplanProposal) => boolean;
}

function save(trip: ActiveTrip | null): string {
  try {
    if (trip) localStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(trip));
    else localStorage.removeItem(TRIP_STORAGE_KEY);
    return "";
  } catch {
    return trip ? "이 기기에 저장하지 못했습니다. 현재 화면에서는 사용할 수 있지만 새로고침하면 변경 내용이 사라집니다." : "기기 저장값을 삭제하지 못했습니다. 브라우저의 사이트 데이터 설정에서 삭제해 주세요.";
  }
}

export const useActiveTrip = create<TripState>((set, get) => ({
  trip: null, hydrated: false, error: "",
  hydrate: () => {
    if (get().hydrated) return;
    try { set({ trip: restoreTrip(localStorage.getItem(TRIP_STORAGE_KEY)), hydrated: true, error: "" }); }
    catch { set({ hydrated: true, error: "저장된 여행을 읽지 못했습니다. 기록 삭제 후 새 여행을 시작해 주세요." }); }
  },
  start: (input) => {
    const state = get();
    if (!state.hydrated || state.error) return;
    if (state.trip?.status === "active") { set({ error: "진행 중인 여행을 먼저 종료해 주세요." }); return; }
    const result = activeTripSchema.safeParse(input);
    if (!result.success) { set({ error: "여행 장소와 남은 시간을 확인해 주세요." }); return; }
    set({ trip: result.data, error: save(result.data) });
  },
  change: (change) => {
    const trip = get().trip;
    if (!trip) return;
    try { const next = updateTrip(trip, change); set({ trip: next, error: save(next) }); }
    catch (error) { set({ error: error instanceof Error ? error.message : "여행을 변경하지 못했습니다." }); }
  },
  clear: () => { const error = save(null); set({ trip: error ? get().trip : null, error }); },
  setParking: (tripId, parking) => {
    const trip = get().trip;
    if (!trip || trip.id !== tripId || trip.status !== "active") return false;
    const result = activeTripSchema.safeParse({ ...trip, parking, situation: null, appliedRoute: null, revision: trip.revision + 1, updatedAt: new Date().toISOString() });
    if (!result.success) { set({ error: "주차 위치와 이름을 확인해 주세요." }); return false; }
    const error = save(result.data);
    // 복귀 위치는 저장에 성공한 경우에만 바꾼다.
    if (error) { set({ error: "주차 위치 변경을 저장하지 못했습니다. 기존 주차 위치를 유지합니다." }); return false; }
    set({ trip: result.data, error: "" });
    return true;
  },
  confirmSituation: (tripId, baseRevision, input) => {
    const trip = get().trip;
    if (!trip || trip.id !== tripId || trip.status !== "active" || trip.revision !== baseRevision) {
      set({ error: "여행 조건이 바뀌었습니다. 현장 상황을 다시 확인해 주세요." }); return false;
    }
    const result = situationSchema.safeParse(input);
    if (!result.success) { set({ error: result.error.issues[0].message }); return false; }
    const data = result.data;
    if (data.affectedStopId && !trip.stops.some((s) => s.id === data.affectedStopId && !s.visitedAt)) {
      set({ error: "변경 대상은 아직 방문하지 않은 장소에서 선택해 주세요." }); return false;
    }
    const location = data.currentLocation;
    const age = Date.now() - Date.parse(location.capturedAt);
    if (age > 5 * 60_000 || age < -30_000) { set({ error: "현재 위치를 다시 확인해 주세요. 위치 확인 후 5분이 지났습니다." }); return false; }
    if (location.source === "stop" && !trip.stops.some((s) => s.id === location.stopId && s.latitude === location.latitude && s.longitude === location.longitude)) {
      set({ error: "현재 위치로 선택한 장소를 확인해 주세요." }); return false;
    }
    const revision = trip.revision + 1;
    const now = new Date().toISOString();
    const next = activeTripSchema.parse({ ...trip, revision, updatedAt: now, appliedRoute: null, remainingMinutes: data.remainingMinutes, situation: { ...data, baseRevision: revision, confirmedAt: now } });
    if (save(next)) { set({ error: "현장 상황을 저장하지 못했습니다. 기존 여행 정보를 유지합니다." }); return false; }
    set({ trip: next, error: "" }); return true;
  },
  acceptReplan: (proposal) => {
    const trip = get().trip;
    if (!trip) return false;
    try {
      const next = applyReplan(trip, proposal);
      if (save(next)) { set({ error: "변경 코스를 저장하지 못했습니다. 기존 코스를 유지합니다." }); return false; }
      set({ trip: next, error: "" }); return true;
    } catch (error) { set({ error: error instanceof Error ? error.message : "변경안을 적용하지 못했습니다." }); return false; }
  },
}));
