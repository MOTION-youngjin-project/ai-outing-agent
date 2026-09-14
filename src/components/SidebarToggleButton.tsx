"use client";

import { useAppStore } from "@/lib/store";
import { Icon } from "@/components/Icon";

// 데스크톱(lg+)은 사이드바가 항상 보이므로 이 버튼 자체가 필요 없다.
// filled: 채팅 화면(디자인/채팅.png)은 같은 아이콘을 민트색 원형 버튼으로 보여준다 —
// 홈 화면(디자인/홈 화면)은 배경 없는 맨 아이콘.
export function SidebarToggleButton({ filled = false }: { filled?: boolean }) {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  return (
    <button
      onClick={toggleSidebar}
      aria-label="메뉴 열기"
      className={
        filled
          ? "flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white lg:hidden"
          : "p-1 text-ink lg:hidden"
      }
    >
      <Icon name="history" className={filled ? "h-[18px] w-[18px]" : "h-6 w-6"} />
    </button>
  );
}
