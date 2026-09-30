import { Icon } from "./Icon";

// 화면 제목에 섹션 캡(sk-cap)을 붙인다 — 본문 섹션 제목과 같은 표식이라
// 화면 제목과 그 아래 소제목들이 하나의 리듬으로 읽힌다(디자인 언어 S3).
export function ScreenHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    // pt-5(고정 20px)엔 env(safe-area-inset-top)이 빠져 있었다 — 카메라 펀치홀/노치가
    // 있는 기기에서 제목 글자가 거기 바로 가렸다(실기기+에뮬레이터 실측, 지도/저장/
    // 마이 탭 공통). .sk-bar와 같은 calc 패턴으로 맞추고 6px 여유를 더 둔다.
    <div className="flex items-center gap-2 px-5 pb-3 pt-[calc(1.25rem+env(safe-area-inset-top)+6px)]">
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
