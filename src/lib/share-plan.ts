import type { Recommendation } from "@/lib/agent";
import { safeSourceUrl } from "./recommendation-sources";
import { verificationText } from "./place-verification";

export function buildSharePlanText(
  recommendation: Recommendation,
  title = "나들이 계획",
): string {
  const places = recommendation.places ?? [];
  const lines = [`🗓️ ${title}`, "", recommendation.message];

  places.forEach((place, index) => {
    lines.push("", `${index + 1}. ${place.name}`, `   ${place.oneLineDescription}`);
    if (place.address || place.daeguDistrict) {
      lines.push(`   📍 ${place.address ?? `대구 ${place.daeguDistrict}`}`);
    }
    if (place.operatingHours) lines.push(`   🕐 ${place.operatingHours}`);
    if (place.fee) lines.push(`   💳 ${place.fee}`);
    if (place.closedDays) lines.push(`   휴무: ${place.closedDays}`);
    lines.push(`   ${verificationText(place.verification)}`);
    lines.push(`   추천 이유: ${place.reason}`);
    for (const source of place.sources ?? []) {
      const url = safeSourceUrl(source.sourceUrl);
      lines.push(`   참고: ${source.documentTitle}${source.page ? ` (PDF ${source.page}페이지)` : ""}${url ? ` ${url}` : ""}`);
    }
  });

  lines.push("", "※ 영업시간·요금·주차 가능 여부는 방문 전에 다시 확인해 주세요.");
  return lines.join("\n");
}
