import { Icon } from "./Icon";

export function ScreenHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-5 pb-3 pt-5">
      {onBack && (
        <button onClick={onBack} aria-label="뒤로가기" className="-ml-1 p-1 text-ink">
          <Icon name="back" className="h-6 w-6" />
        </button>
      )}
      <h1 className="flex-1 text-[22px] font-bold tracking-tight text-ink">{title}</h1>
      {right}
    </div>
  );
}
