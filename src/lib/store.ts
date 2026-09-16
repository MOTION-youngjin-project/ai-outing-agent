import { create } from "zustand";
import type { ChatTurn } from "@/lib/agent";
import type { RecommendResult } from "@/lib/clientApi";

interface AppState {
  input: string;
  history: ChatTurn[];
  // 지금 진행 중인 대화를 묶는 키 — 첫 turn에서 발급하고, 사이드바에서 과거 대화를
  // 이어서 열면 그 대화의 값으로 교체된다. "새 질문" 시작 시 history와 함께 null로
  // 초기화된다(새로고침도 마찬가지 — history와 동일하게 영속화하지 않음).
  conversationId: string | null;
  regionId: string;
  sidebarOpen: boolean;
  // 채팅 화면에 인라인으로 보여줄 마지막 추천 결과 — /recommend/[runId]로 자동 이동하는
  // 대신 홈 화면 안에서 카드로 보여주고("코스 상세 보기" 눌러야 그 화면으로 이동), 새
  // 질문 시작 시(Sidebar "새 질문") history와 함께 초기화된다.
  lastRecommendation: RecommendResult | null;
  // history의 사용자 턴과 같은 순서로 쌓이는 턴별 추천 결과 — 채팅 화면이 각 턴마다
  // CourseCard를 온전히 다시 그릴 때 쓴다(history 자체엔 요약 텍스트만 있음). 실패한
  // 턴도 null로 자리를 채워서 인덱스가 history의 사용자 턴과 항상 맞게 유지한다 —
  // 성공한 턴만 push하면 실패 이후 턴부터 인덱스가 영구히 어긋난다.
  recommendations: (RecommendResult | null)[];
  setInput: (input: string) => void;
  setHistory: (history: ChatTurn[]) => void;
  setConversationId: (conversationId: string | null) => void;
  setRegionId: (regionId: string) => void;
  setLastRecommendation: (result: RecommendResult | null) => void;
  setRecommendations: (recommendations: (RecommendResult | null)[]) => void;
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
  conversationId: null,
  regionId: "",
  sidebarOpen: false,
  lastRecommendation: null,
  recommendations: [],
  setInput: (input) => set({ input }),
  setHistory: (history) => set({ history }),
  setConversationId: (conversationId) => set({ conversationId }),
  setRegionId: (regionId) => set({ regionId }),
  setLastRecommendation: (lastRecommendation) => set({ lastRecommendation }),
  setRecommendations: (recommendations) => set({ recommendations }),
  openSidebar: () => set({ sidebarOpen: true }),
  closeSidebar: () => set({ sidebarOpen: false }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
