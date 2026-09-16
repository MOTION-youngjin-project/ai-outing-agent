import { Icon } from "./Icon";

// 화면 제목에 섹션 캡(sk-cap)을 붙인다 — 본문 섹션 제목과 같은 표식이라
// 화면 제목과 그 아래 소제목들이 하나의 리듬으로 읽힌다(디자인 언어 S3).
export function ScreenHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-5 pb-3 pt-5">
      {onBack && (
        <button onClick={onBack} aria-label="뒤로가기" className="-ml-1 p-1 text-ink">
          <Icon name="back" className="h-6 w-6" />
        </button>
      )}
      <h1 className="sk-cap min-w-0 flex-1 text-[22px] font-bold tracking-tight text-ink">
        <span className="truncate">{title}</span>
      </h1>
      {right}
    </div>
  );
}
