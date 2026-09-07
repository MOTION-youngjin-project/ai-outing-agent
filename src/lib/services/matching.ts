import type { Recommendation } from "@/lib/agent";
import { haversineMeters } from "../tools/parking.ts";

// 이 파일은 순수 함수만 담는다 — DB/외부 API를 안 건드려서 scripts/self-check.ts가
// 의존성 없이 바로 import해서 검증할 수 있어야 한다(node --experimental-strip-types는
// "@/*" 경로 별칭을 런타임에 못 풀어서, 타입 전용 import 말고는 여기서 값 import를 하면 안 됨 —
// 다른 순수 함수 파일을 상대 경로로 값 import하는 건 괜찮음, tools/parking.ts도 마찬가지).

// 카카오가 준 검색 결과 중 LLM이 말한 이름과 가장 잘 맞는 것을 고른다.
// 이름이 정확히 일치하는 결과를 최우선으로 하고(동명이인 오매칭 완화), 없으면 부분 일치,
// 그것도 없으면 첫 결과.
export function pickBestPlaceMatch<T extends { place_name: string }>(
  name: string,
  documents: T[]
): T | undefined {
  return (
    documents.find((d) => d.place_name === name) ??
    documents.find((d) => d.place_name.includes(name) || name.includes(d.place_name)) ??
    documents[0]
  );
}

// 주소 문자열과 후보 Region 목록으로 가장 적절한 Region을 고른다.
// 구/군 단위가 주소 토큰과 정확히 일치하면 그걸 우선하고(예: "대구 수성구..." → 수성구),
// 없으면 시/도 단위로 완화한다(예: "대구 남구..." → 남구는 시드 안 됐으면 대구광역시).
export function pickRegionForAddress<T extends { name: string; level: string }>(
  address: string,
  regions: T[]
): T | null {
  const tokens = address.split(" ").filter(Boolean);

  const district = regions.find((r) => r.level === "구군" && tokens.includes(r.name));
  if (district) return district;

  const firstToken = tokens[0];
  if (!firstToken) return null;
  return regions.find((r) => r.level === "시도" && r.name.includes(firstToken)) ?? null;
}

const INDOOR_KEYWORDS = ["실내", "미술관", "박물관", "전시", "공연장", "쇼핑몰"];
const OUTDOOR_KEYWORDS = ["야외", "실외", "산책", "공원", "전망대", "호수", "등산", "강변"];

// agent.ts가 실내/야외를 구조화된 필드로 안 줘서(RecommendationSchema에 없음, agent.ts는
// 이번 범위에서 안 건드리기로 함), message/장소 설명 텍스트에서 키워드로 가볍게 추론한다.
// 실내 신호만 있으면 indoor, 야외 신호만 있으면 outdoor, 둘 다 있거나 둘 다 없으면 mixed —
// 오늘 실제 응답도 "낮엔 실내 미술관, 저녁엔 야외 산책"처럼 섞인 경우가 흔해서 mixed가
// 정직한 기본값이다.
export function inferEnvironmentMode(recommendation: Recommendation): "indoor" | "outdoor" | "mixed" {
  const text = [
    recommendation.message,
    ...(recommendation.places ?? []).flatMap((p) => [p.oneLineDescription, p.reason, ...(p.features ?? [])]),
  ].join(" ");

  const hasIndoor = INDOOR_KEYWORDS.some((k) => text.includes(k));
  const hasOutdoor = OUTDOOR_KEYWORDS.some((k) => text.includes(k));

  if (hasIndoor && !hasOutdoor) return "indoor";
  if (hasOutdoor && !hasIndoor) return "outdoor";
  return "mixed";
}

// 카카오 category_name은 "여행 > 관광,명소 > 공원 > 도시공원"처럼 대분류>소분류
// 계층이라, 배지에는 가장 구체적인 마지막 항목만 보여준다.
export function extractCategoryLabel(categorySummary: string | null): string | null {
  if (!categorySummary) return null;
  const parts = categorySummary.split(">").map((s) => s.trim()).filter(Boolean);
  return parts.at(-1) ?? null;
}

// 거리(km) 배지 계산. 소수 첫째자리로 반올림(예: 3.2km).
export function computeDistanceKm(
  origin: { latitude: number; longitude: number } | null,
  place: { latitude: number; longitude: number } | null
): number | null {
  if (!origin || !place) return null;
  return Math.round(haversineMeters(origin, place) / 100) / 10;
}
