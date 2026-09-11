import { safeSourceUrl, type RecommendationSource } from "@/lib/recommendation-sources";
import { verificationText, type PlaceVerification } from "@/lib/place-verification";

export function RecommendationSources({ sources, verification, closedDays }: { sources?: RecommendationSource[]; verification?: PlaceVerification; closedDays?: string }) {
  return <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
    <p className="text-xs leading-5 text-amber-800 dark:text-amber-300">{verificationText(verification)}</p>
    {closedDays && <p className="mt-1">휴무: {closedDays}</p>}
    {!!sources?.length && <p className="mt-2 font-medium">참고 자료</p>}
    <ul className="mt-1 space-y-1">
      {sources?.map((source) => {
        const url = safeSourceUrl(source.sourceUrl);
        const label = `${source.documentTitle}${source.page ? ` · PDF ${source.page}페이지` : ""}`;
        return <li key={source.id}>{url
          ? <a href={url} target="_blank" rel="noopener noreferrer" className="underline">{label} ↗</a>
          : label}</li>;
      })}
    </ul>
  </div>;
}
