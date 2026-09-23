"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";

export type FilterGroup = { label: string; options: readonly string[] };

// 결과 목록을 거르는 선택 창.
//
// 예전엔 조건들이 한 줄에 칩으로 늘어서서 옆으로 스크롤해야 했다 — 지금 뭘로
// 걸러져 있는지 보려면 줄을 끝까지 밀어봐야 하고, 뒤쪽 조건은 있는 줄도 모른다.
// 이제 버튼 하나가 "지금 선택"을 그대로 보여주고, 누르면 아래로 창이 펴지면서
// 모든 조건이 한 화면에 들어온다(줄바꿈이라 가로 스크롤이 없다).
//
// 거르는 규칙 자체는 바뀌지 않았다 — 값(null = 전체)을 그대로 위로 올려보낸다.
export function FilterMenu({
  groups,
  value,
  onChange,
  resultCount,
}: {
  groups: FilterGroup[];
  value: string | null;
  onChange: (next: string | null) => void;
  resultCount: number;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 바깥을 누르거나 Esc를 누르면 닫는다. pointerdown으로 잡아야 스크롤을 시작하는
  // 순간에도 닫히고, 창 안의 버튼 클릭보다 먼저 닫혀서 선택이 씹히는 일이 없다
  // (창 안쪽은 contains로 걸러낸다).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function pick(next: string | null) {
    onChange(next);
    setOpen(false);
  }

  const activeLabel = value ?? "전체";

  return (
    <div ref={rootRef} className="relative">
      {/* 창이 열리면 뒤를 덮는 막(z-20)이 깔리므로, 트리거는 그보다 위에 둬야
          다시 눌러 닫을 때 막이 아니라 버튼이 눌린다. */}
      <div className="relative z-30 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="true"
          className={`sk flex items-center gap-2 px-3.5 py-2 text-[13px] ${
            value ? "sk-on" : "font-medium text-ink-soft"
          }`}
        >
          <Icon name="filter" className="h-3.5 w-3.5" />
          <span className="max-w-[120px] truncate">{activeLabel}</span>
          {/* 열리면 위를 가리킨다 — 창이 어디로 열렸는지 화살표가 말해준다 */}
          <Icon
            name="down"
            className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "-rotate-180" : ""}`}
          />
        </button>
        <span className="text-[12px] text-muted">{resultCount}곳</span>
      </div>

      {open && (
        <>
          {/* 창 뒤를 살짝 덮어서 "지금은 고르는 중"임을 알린다.
              바깥 클릭 닫기는 위 pointerdown이 처리하므로 이건 순수 장식이다. */}
          <div aria-hidden className="sk-scrim fixed inset-0 z-20 bg-ink/5" />
          <div
            aria-label="조건으로 거르기"
            className="sk-panel sk-drop absolute left-0 top-[calc(100%+8px)] z-30 w-[268px] max-w-[calc(100vw-40px)] p-3"
          >
            <button
              type="button"
              aria-pressed={value === null}
              onClick={() => pick(null)}
              className={`flex w-full items-center justify-between rounded-[11px] px-3 py-2 text-left text-[14px] ${
                value === null ? "bg-mint-bg font-bold text-accent-deep" : "font-medium text-ink"
              }`}
            >
              전체
              {value === null && <Icon name="check" className="h-4 w-4" />}
            </button>

            {groups
              .filter((g) => g.options.length > 0)
              .map((group) => (
                <div key={group.label} className="mt-2.5">
                  <p className="sk-cap px-1 pb-1.5 text-[11px] font-semibold text-muted">{group.label}</p>
                  {/* 줄바꿈으로 다 보여준다 — 여기서 또 옆으로 밀게 하면 원래 문제로 돌아간다 */}
                  <div className="flex flex-wrap gap-1.5">
                    {group.options.map((option) => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={value === option}
                        onClick={() => pick(value === option ? null : option)}
                        className={
                          value === option
                            ? "sk sk-on px-3 py-1.5 text-[13px]"
                            : "sk px-3 py-1.5 text-[13px] font-medium text-muted"
                        }
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
