"use client";

import { useAppStore } from "@/lib/store";
import { useRecommendationFlow } from "@/hooks/useRecommendationFlow";
import { InputScreen } from "@/components/screens/InputScreen";
import { ResultsScreen } from "@/components/screens/ResultsScreen";
import { DetailScreen } from "@/components/screens/DetailScreen";
import { ParkingScreen } from "@/components/screens/ParkingScreen";
import { ParkingDetailScreen } from "@/components/screens/ParkingDetailScreen";
import { LoginScreen } from "@/components/screens/LoginScreen";
import { SignupScreen } from "@/components/screens/SignupScreen";
import { MyPageScreen } from "@/components/screens/MyPageScreen";
import { SettingsScreen } from "@/components/screens/SettingsScreen";
import { BottomNav } from "@/components/BottomNav";

// 화면 하나당 컴포넌트 하나(src/components/screens/*) — 전역 UI 상태(현재 화면, 선택된
// 장소 등)는 Zustand 스토어에서 각 화면이 직접 읽고, 서버 데이터는 React Query 캐시로
// 화면 간에 자연히 공유된다(같은 queryKey면 재요청 없이 캐시 재사용). 예외는
// useRecommendationFlow 하나뿐 — useMutation은 useQuery와 달리 컴포넌트마다 부르면
// 상태가 안 섞여서, 진행 상황을 보여주는 InputScreen과 결과를 보여주는 ResultsScreen이
// 같은 추천 요청 하나를 같이 봐야 하므로 여기서 한 번만 호출해 내려준다.
export default function Home() {
  const { view, selectedPlace, selectedParkingSpot } = useAppStore();
  const flow = useRecommendationFlow();
  const showBottomNav = view === "input" || view === "results" || view === "mypage";

  return (
    <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col bg-page">
      <div className="flex flex-1 flex-col pb-6">
        {(view === "input" || view === "loading") && <InputScreen flow={flow} />}
        {view === "results" && flow.recommendation?.places && (
          <ResultsScreen recommendation={flow.recommendation} />
        )}
        {view === "detail" && selectedPlace && <DetailScreen />}
        {view === "parking" && <ParkingScreen />}
        {view === "parking-detail" && selectedParkingSpot && <ParkingDetailScreen />}
        {view === "login" && <LoginScreen />}
        {view === "signup" && <SignupScreen />}
        {view === "mypage" && <MyPageScreen />}
        {view === "settings" && <SettingsScreen />}
      </div>

      {showBottomNav && <BottomNav hasRecommendation={!!flow.recommendation} />}
    </div>
  );
}
