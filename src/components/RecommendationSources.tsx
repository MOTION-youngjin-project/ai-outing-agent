import { safeSourceUrl, type RecommendationSource } from "@/lib/recommendation-sources";
import { verificationText, type PlaceVerification } from "@/lib/place-verification";

export function RecommendationSources({ sources, verification, closedDays }: { sources?: RecommendationSource[]; verification?: PlaceVerification; closedDays?: string }) {
  return <div className="mt-3 text-[13px] text-muted">
    {/* 검증 안내는 ParkingScreen/TransitScreen의 안내 박스와 같은 톤(mint-bg + ink-soft)을 쓴다 —
        기본 팔레트 amber로 따로 노는 대신, 이 앱에서 "읽고 넘어가야 하는 안내"에 이미 쓰는 표현을 재사용. */}
    <p className="rounded-xl bg-mint-bg px-3 py-2 text-[12px] leading-relaxed text-ink-soft">{verificationText(verification)}</p>
    {closedDays && <p className="mt-1.5 text-[12px]">휴무: {closedDays}</p>}
    {!!sources?.length && <p className="mt-2.5 text-[12px] font-semibold text-ink">참고 자료</p>}
    <ul className="mt-1 space-y-1 text-[12px]">
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
