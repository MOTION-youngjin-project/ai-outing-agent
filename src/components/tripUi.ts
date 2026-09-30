// 여행 진행·포토 코스 화면이 같이 쓰는 모양. 앱 공통 조형(globals.css의 sk-*)을 그대로 쓴다 —
// 이 화면들만 기본 Tailwind 테두리 모양이라 다른 앱처럼 보였다(2026-09-30).
export const ui = {
  panel: "sk-panel flex flex-col gap-3 p-4",
  sub: "flex flex-col gap-2.5 rounded-2xl bg-page p-3.5",
  title: "sk-cap text-[15px] font-bold text-ink",
  heading: "text-[14px] font-bold text-ink",
  label: "flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft",
  text: "text-[13px] leading-relaxed text-ink-soft",
  note: "text-[12px] leading-relaxed text-muted",
  field: "sk-input w-full px-3.5 py-2.5 text-[14px] text-ink outline-none placeholder:text-muted/60",
  btn: "sk flex items-center justify-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold text-ink-soft disabled:opacity-50",
  primary: "sk sk-primary flex items-center justify-center gap-1.5 px-4 py-2.5 text-[13px]",
  quiet: "sk sk-quiet px-3 py-2 text-[12px] font-semibold text-muted",
  chip: "sk-my-chip",
  chipOn: "sk-my-chip sk-my-chip-on",
  error: "sk-notice sk-notice-error text-[13px]",
  check: "flex items-start gap-2 text-[13px] text-ink-soft [&>input]:mt-0.5 [&>input]:accent-[var(--sk-cta)]",
  row: "flex flex-wrap gap-2",
} as const;
