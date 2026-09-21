"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import type { Region } from "@/lib/clientApi";

// 지역 고르기.
//
// 원래는 브라우저 기본 <select>였다 — 열면 운영체제가 그린 목록이 뜨는데, 파란 선택
// 막대도 글꼴도 앱과 아무 상관이 없어서 여기만 다른 앱처럼 보였다. 조건 필터(FilterMenu)와
// 같은 방식으로 바꾼다: 트리거를 누르면 아래로 창이 펴지고, 그 안에서 고른다.
//
// 고르는 값과 올려보내는 값(regionId)은 <select>와 똑같다 — 화면만 바뀐다.
export function RegionPicker({
  regions,
  value,
  onChange,
  disabled = false,
}: {
  regions: Region[];
  value: string;
  onChange: (regionId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

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

  // 목록이 길어 스크롤이 생기면(17개 시/도) 이미 고른 지역이 화면 밖에 있을 수 있다 —
  // 열자마자 그 줄로 맞춰준다. block:"nearest"라 이미 보이면 아무것도 안 한다.
  useEffect(() => {
    if (!open) return;
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  const selected = regions.find((r) => r.id === value);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="true"
        // z-30은 이 창이 열려 있을 때만 준다 — 항상 올려두면 위쪽 시간별 날씨
        // 팝오버가 열렸을 때 그 밑이 아니라 위로 삐져나와 글자가 겹친다.
        className={`sk-input flex w-full items-center gap-2 px-4 py-3 text-left disabled:opacity-50 ${
          open ? "relative z-30" : ""
        }`}
      >
        <Icon name="pin" className="h-[18px] w-[18px] shrink-0 text-accent" />
        <span
          className={`min-w-0 flex-1 truncate text-[15px] font-medium ${
            selected ? "text-ink" : "text-muted"
          }`}
        >
          {selected?.name ?? "지역을 선택하세요"}
        </span>
        <Icon
          name="down"
          className={`h-[18px] w-[18px] shrink-0 text-muted transition-transform duration-200 ${
            open ? "-rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <>
          <div aria-hidden className="sk-scrim fixed inset-0 z-20 bg-ink/5" />
          <div
            aria-label="지역 고르기"
            className="sk-panel sk-drop absolute inset-x-0 top-[calc(100%+8px)] z-30 overflow-hidden p-1.5"
          >
            {/* 목록이 화면을 다 덮지 않도록 높이를 잘라 안에서만 스크롤한다 */}
            <div className="max-h-[min(46vh,320px)] overflow-y-auto overscroll-contain">
              {regions.map((region) => {
                const active = region.id === value;
                return (
                  <button
                    key={region.id}
                    type="button"
                    ref={active ? selectedRef : undefined}
                    aria-pressed={active}
                    onClick={() => {
                      onChange(region.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-[11px] px-3.5 py-2.5 text-left text-[15px] ${
                      active ? "bg-mint-bg font-bold text-accent-deep" : "font-medium text-ink"
                    }`}
                  >
                    <span className="flex min-w-0 flex-col">
                      {region.name}
                      {/* 주차·구 단위 정보는 대구 데이터만 있다 — 고른 뒤에 버튼이 회색이 되는
                          이유를 미리 조용히 알려준다(보조 정보라 작게). */}
                      {region.name !== "대구광역시" && (
                        <span className="text-[11px] font-normal leading-snug text-muted">주차·구 정보는 대구만 지원</span>
                      )}
                    </span>
                    {active && <Icon name="check" className="h-4 w-4 shrink-0" />}
                  </button>
                );
              })}
              {regions.length === 0 && (
                <p className="px-3.5 py-6 text-center text-[13px] text-muted">
                  지역 목록을 불러오는 중이에요.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
