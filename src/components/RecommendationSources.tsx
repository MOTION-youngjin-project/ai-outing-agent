import { safeSourceUrl, type RecommendationSource } from "@/lib/recommendation-sources";
import { verificationText, type PlaceVerification } from "@/lib/place-verification";
import { Icon } from "@/components/Icon";

// 증거 레일(sk-rail*) — 이 앱의 조형 규칙. 영업정보가 어디서 왔는지에 따라
// 왼쪽 세로선의 "형태"가 달라진다: 실선=관광 API 실측, 점선=PDF 참고자료(확정 아님),
// 옅은 실선=출처 미확인. 색을 지워도 선 모양만으로 구별되므로 색맹·흑백 인쇄에서도 읽힌다.
// verification.source는 place-verification.ts가 이미 계산해 내려주는 값이라
// 여기서 새로 판단하거나 데이터를 만들지 않는다.
const RAIL_BY_SOURCE: Record<PlaceVerification["source"], string> = {
  tour_api: "sk-rail",
  pdf: "sk-rail-est",
  unverified: "sk-rail-none",
};

export function RecommendationSources({ sources, verification, closedDays }: { sources?: RecommendationSource[]; verification?: PlaceVerification; closedDays?: string }) {
  const rail = RAIL_BY_SOURCE[verification?.source ?? "unverified"];

  return <div className="text-[13px] text-muted">
    {/* 출처 안내는 장소 이름·설명보다 한 단계 뒤에 있는 정보다. 예전엔 본문과 같은
        크기·색으로 카드 한가운데를 차지해서 이름보다 먼저 읽혔다 — 11px 보조 문구로
        낮추고, 휴무처럼 길어질 수 있는 항목은 두 줄까지만 보여준다. */}
    <div className={`${rail} sk-enter py-0.5`}>
      <p className="text-[11px] leading-relaxed text-muted">{verificationText(verification)}</p>
      {closedDays && (
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-ink-soft">
          <span className="font-semibold">휴무</span> {closedDays}
        </p>
      )}
    </div>
    {!!sources?.length && <>
      <p className="sk-cap mt-2.5 text-[11px] font-semibold text-ink">참고 자료</p>
      <ul className="mt-1 space-y-0.5 pl-[11px] text-[11px]">
        {sources.map((source) => {
          const url = safeSourceUrl(source.sourceUrl);
          const label = `${source.documentTitle}${source.page ? ` · PDF ${source.page}페이지` : ""}`;
          return <li key={source.id} className="leading-relaxed">{url
            ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-baseline gap-1 text-accent underline underline-offset-2">
                {label}
                {/* 예전엔 ↗ 문자를 그대로 썼는데 폰트에 따라 네모 박힌 이모지로 보였다 */}
                <Icon name="arrowUpRight" className="h-3 w-3 shrink-0 self-center" />
              </a>
            : label}</li>;
        })}
      </ul>
    </>}
  </div>;
}
