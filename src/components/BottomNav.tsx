"use client";

import { useAppStore } from "@/lib/store";
import { Icon } from "@/components/Icon";

export function BottomNav({ hasRecommendation }: { hasRecommendation: boolean }) {
  const { view, setView } = useAppStore();

  const tabs = [
    { id: "home", label: "홈", icon: "home", target: "input" as const, active: view === "input" },
    { id: "recommend", label: "추천", icon: "compass", target: "results" as const, active: view === "results" },
    { id: "saved", label: "저장", icon: "heart", target: "mypage" as const, active: false },
    { id: "mypage", label: "마이", icon: "user", target: "mypage" as const, active: view === "mypage" },
  ];

  return (
    <nav className="sticky bottom-0 mt-auto flex items-center justify-around border-t border-hairline bg-white/95 px-2 pb-2 pt-2 backdrop-blur">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => {
            if (tab.target === "results" && !hasRecommendation) return;
            setView(tab.target);
          }}
          className={`flex flex-1 flex-col items-center gap-1 py-1 text-[11px] font-medium ${
            tab.active ? "text-accent" : "text-slate-400"
          }`}
        >
          <Icon name={tab.icon} className="h-[22px] w-[22px]" />
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
