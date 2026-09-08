import { create } from "zustand";
import type { ChatTurn } from "@/lib/agent";
import type { PlaceWithMeta, ParkingSpotWithDistance } from "@/lib/clientApi";

// /api/recommend가 내려주는 장소는 항상 이 enrichment(category/distanceKm/placeId/좌표)가
// 붙은 상태라 스토어도 그 모양을 그대로 쓴다 — agent.ts의 원본 스키마 타입만 쓰면
// ResultsScreen에서 선택한 장소를 여기 저장할 때 실제로 있는 필드가 타입에 안 잡힌다.
export type Place = PlaceWithMeta;
export type ParkingSpot = ParkingSpotWithDistance;
export type View =
  | "input"
  | "loading"
  | "results"
  | "detail"
  | "parking"
  | "parking-detail"
  | "mypage"
  | "login"
  | "signup"
  | "settings";

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
