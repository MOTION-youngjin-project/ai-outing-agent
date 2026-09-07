import { create } from "zustand";
import type { ChatTurn, Recommendation } from "@/lib/agent";
import type { ParkingSpot } from "@/lib/tools/parking";

export type Place = NonNullable<Recommendation["places"]>[number];
export type View = "input" | "loading" | "results" | "detail" | "parking" | "parking-detail" | "mypage";

interface AppState {
  view: View;
  input: string;
  history: ChatTurn[];
  selectedPlace: Place | null;
  selectedParkingSpot: ParkingSpot | null;
  regionId: string;
  setView: (view: View) => void;
  setInput: (input: string) => void;
  setHistory: (history: ChatTurn[]) => void;
  selectPlace: (place: Place | null) => void;
  selectParkingSpot: (spot: ParkingSpot | null) => void;
  setRegionId: (regionId: string) => void;
}

// ponytail: 새로고침 시 초기화(영속화 안 함) — 사용자 대화/선택을 영구 저장하지 않는다는
// 프로젝트 원칙(prisma 스키마 Note)과 맞춤. 필요해지면 zustand/middleware persist 추가.
export const useAppStore = create<AppState>((set) => ({
  view: "input",
  input: "",
  history: [],
  selectedPlace: null,
  selectedParkingSpot: null,
  regionId: "",
  setView: (view) => set({ view }),
  setInput: (input) => set({ input }),
  setHistory: (history) => set({ history }),
  selectPlace: (selectedPlace) => set({ selectedPlace }),
  selectParkingSpot: (selectedParkingSpot) => set({ selectedParkingSpot }),
  setRegionId: (regionId) => set({ regionId }),
}));
