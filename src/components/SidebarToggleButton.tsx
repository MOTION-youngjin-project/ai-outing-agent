"use client";

import { useAppStore } from "@/lib/store";
import { Icon } from "@/components/Icon";

// 데스크톱(lg+)은 사이드바가 항상 보이므로 이 버튼 자체가 필요 없다.
export function SidebarToggleButton() {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  return (
    <button onClick={toggleSidebar} aria-label="대화 기록" className="p-1 text-ink lg:hidden">
      <Icon name="menu" className="h-6 w-6" />
    </button>
  );
}
