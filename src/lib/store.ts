import { create } from "zustand";
import type { ChatTurn } from "@/lib/agent";
import type { RecommendResult } from "@/lib/clientApi";

interface AppState {
  input: string;
  history: ChatTurn[];
  regionId: string;
  sidebarOpen: boolean;
  // 채팅 화면에 인라인으로 보여줄 마지막 추천 결과 — /recommend/[runId]로 자동 이동하는
  // 대신 홈 화면 안에서 카드로 보여주고("코스 상세 보기" 눌러야 그 화면으로 이동), 새
  // 질문 시작 시(Sidebar "새 질문") history와 함께 초기화된다.
  lastRecommendation: RecommendResult | null;
  setInput: (input: string) => void;
  setHistory: (history: ChatTurn[]) => void;
  setRegionId: (regionId: string) => void;
  setLastRecommendation: (result: RecommendResult | null) => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
}

// ponytail: 새로고침 시 초기화(영속화 안 함) — 사용자 대화를 영구 저장하지 않는다는
// 프로젝트 원칙(prisma 스키마 Note)과 맞춤. 필요해지면 zustand/middleware persist 추가.
// selectedPlace/selectedParkingSpot/view는 라우팅 전환으로 제거됨 — 이제 URL 파라미터(runId/
// placeId/pkltId)와 React Query 캐시(["recommend", runId])가 그 역할을 대신한다.
export const useAppStore = create<AppState>((set) => ({
  input: "",
  history: [],
  regionId: "",
  sidebarOpen: false,
  lastRecommendation: null,
  setInput: (input) => set({ input }),
  setHistory: (history) => set({ history }),
  setRegionId: (regionId) => set({ regionId }),
  setLastRecommendation: (lastRecommendation) => set({ lastRecommendation }),
  openSidebar: () => set({ sidebarOpen: true }),
  closeSidebar: () => set({ sidebarOpen: false }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
