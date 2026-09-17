import { safeSourceUrl, type RecommendationSource } from "@/lib/recommendation-sources";
import { verificationText, type PlaceVerification } from "@/lib/place-verification";

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

  return <div className="mt-3 text-[13px] text-muted">
    <div className={`${rail} sk-enter py-0.5`}>
      <p className="text-[12px] leading-relaxed text-ink-soft">{verificationText(verification)}</p>
      {closedDays && <p className="mt-1 text-[12px]">휴무: {closedDays}</p>}
    </div>
    {!!sources?.length && <p className="sk-cap mt-3 text-[12px] font-semibold text-ink">참고 자료</p>}
    <ul className="mt-1.5 space-y-1 pl-[11px] text-[12px]">
      {sources?.map((source) => {
        const url = safeSourceUrl(source.sourceUrl);
        const label = `${source.documentTitle}${source.page ? ` · PDF ${source.page}페이지` : ""}`;
        return <li key={source.id}>{url
          ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">{label} ↗</a>
          : label}</li>;
      })}
    </ul>
  </div>;
}
