import { create } from "zustand";
import type { ChatTurn } from "@/lib/agent";

interface AppState {
  input: string;
  history: ChatTurn[];
  regionId: string;
  setInput: (input: string) => void;
  setHistory: (history: ChatTurn[]) => void;
  setRegionId: (regionId: string) => void;
}

// ponytail: 새로고침 시 초기화(영속화 안 함) — 사용자 대화를 영구 저장하지 않는다는
// 프로젝트 원칙(prisma 스키마 Note)과 맞춤. 필요해지면 zustand/middleware persist 추가.
// selectedPlace/selectedParkingSpot/view는 라우팅 전환으로 제거됨 — 이제 URL 파라미터(runId/
// placeId/pkltId)와 React Query 캐시(["recommend", runId])가 그 역할을 대신한다.
export const useAppStore = create<AppState>((set) => ({
  input: "",
  history: [],
  regionId: "",
  setInput: (input) => set({ input }),
  setHistory: (history) => set({ history }),
  setRegionId: (regionId) => set({ regionId }),
}));
