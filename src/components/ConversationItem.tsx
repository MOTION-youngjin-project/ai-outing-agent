"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteConversation, updateConversation, type RecentQuestion } from "@/lib/clientApi";
import { Icon } from "@/components/Icon";

const LONG_PRESS_MS = 500;

// 사이드바 대화 기록 한 줄 + 대화 메뉴(고정·이름 변경·삭제).
// 메뉴 여는 방법은 웹/앱이 아니라 입력 장치로 가른다 — 마우스(PC 웹)는 줄에 올리면 뜨는
// ⋮ 버튼, 터치(모바일 웹·나들플랜 앱 웹뷰)는 길게 누르기. 앱을 따로 감지할 필요가 없다.
export function ConversationItem({
  item,
  time,
  disabled,
  onOpen,
  onDeleted,
}: {
  item: RecentQuestion;
  time: string;
  disabled: boolean;
  onOpen: () => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 길게 눌러 메뉴를 연 뒤 손을 떼면 click이 따라온다 — 그 click으로 대화가 열리지 않게 막는다.
  const longPressed = useRef(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["recent-questions"] });
  const update = useMutation({
    mutationFn: (patch: { pinned?: boolean; title?: string }) => updateConversation(item.id, patch),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: () => deleteConversation(item.id),
    onSuccess: onDeleted,
    onSettled: refresh,
  });

  function closeMenu() {
    setMenuOpen(false);
    setConfirmDelete(false);
  }
  function cancelPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }
  function saveTitle(value: string) {
    setRenaming(false);
    const title = value.trim();
    if (title && title !== item.question) update.mutate({ title });
  }

  if (renaming) {
    return (
      <input
        autoFocus
        defaultValue={item.question}
        maxLength={80}
        onBlur={(e) => saveTitle(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setRenaming(false);
        }}
        aria-label="대화 이름"
        className="w-full rounded-xl border border-accent bg-white px-2 py-2 text-[13px] text-ink outline-none"
      />
    );
  }

  return (
    <div className="group relative">
      <button
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          onOpen();
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          longPressed.current = false;
          pressTimer.current = setTimeout(() => {
            longPressed.current = true;
            setMenuOpen(true);
            navigator.vibrate?.(10);
          }, LONG_PRESS_MS);
        }}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        // 안드로이드·웹뷰는 길게 누르면 기본 컨텍스트 메뉴/텍스트 선택이 먼저 뜬다.
        onContextMenu={(e) => e.preventDefault()}
        disabled={disabled || remove.isPending}
        className="flex w-full select-none items-center gap-2 rounded-xl px-2 py-2 text-left [-webkit-touch-callout:none] hover:bg-page disabled:opacity-50 pointer-fine:group-hover:pr-9"
      >
        {item.pinned ? (
          <Icon name="pin" className="h-3.5 w-3.5 shrink-0 text-accent" />
        ) : (
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full border border-hairline" />
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">{item.question}</span>
        <span className={`shrink-0 text-[11px] text-muted ${menuOpen ? "invisible" : "pointer-fine:group-hover:invisible"}`}>
          {time}
        </span>
      </button>

      {/* ⋮ — 마우스가 있는 기기에서만, 줄에 올렸을 때(또는 메뉴가 열려 있을 때) 보인다. */}
      <button
        onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
        aria-label="대화 메뉴"
        className={`absolute right-1 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-white hover:text-ink ${
          menuOpen ? "pointer-fine:flex" : "pointer-fine:group-hover:flex"
        }`}
      >
        <Icon name="more" className="h-4 w-4" />
      </button>

      {menuOpen && (
        <>
          <button aria-label="메뉴 닫기" onClick={closeMenu} className="fixed inset-0 z-30 cursor-default" />
          <div
            role="menu"
            className="absolute right-1 top-full z-40 mt-1 w-40 overflow-hidden rounded-xl border border-hairline bg-white py-1 text-[13px] shadow-[0_6px_20px_rgba(17,24,39,0.12)]"
          >
            {confirmDelete ? (
              <div className="px-3 py-2">
                <p className="pb-2 text-[12px] text-ink-soft">이 대화를 삭제할까요?</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      closeMenu();
                      remove.mutate();
                    }}
                    className="flex-1 rounded-lg bg-red-500 py-1.5 text-[12px] font-semibold text-white"
                  >
                    삭제
                  </button>
                  <button onClick={closeMenu} className="flex-1 rounded-lg bg-page py-1.5 text-[12px] text-ink-soft">
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    update.mutate({ pinned: !item.pinned });
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-ink-soft hover:bg-page"
                >
                  <Icon name="pin" className="h-4 w-4" />
                  {item.pinned ? "고정 해제" : "대화 고정"}
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    setRenaming(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-ink-soft hover:bg-page"
                >
                  <Icon name="edit" className="h-4 w-4" />
                  이름 변경
                </button>
                <button
                  role="menuitem"
                  onClick={() => setConfirmDelete(true)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-red-500 hover:bg-page"
                >
                  <Icon name="trash" className="h-4 w-4" />
                  대화 삭제
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
