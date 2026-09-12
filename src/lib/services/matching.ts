import type { Recommendation } from "@/lib/agent";
import { haversineMeters } from "../tools/parking.ts";

// 이 파일은 순수 함수만 담는다 — DB/외부 API를 안 건드려서 scripts/self-check.ts가
// 의존성 없이 바로 import해서 검증할 수 있어야 한다(node --experimental-strip-types는
// "@/*" 경로 별칭을 런타임에 못 풀어서, 타입 전용 import 말고는 여기서 값 import를 하면 안 됨 —
// 다른 순수 함수 파일을 상대 경로로 값 import하는 건 괜찮음, tools/parking.ts도 마찬가지).

// 카카오가 준 검색 결과 중 LLM이 말한 이름과 가장 잘 맞는 것을 고른다.
// 1순위는 완전일치 1건. 같은 이름이 여러 개면(진짜 동명이인) 미매칭으로 남긴다.
// 완전일치가 없으면 이름을 통째로 품은 후보 중 가장 짧은 것 — 카카오 공식 명칭은 앞뒤에
// 수식이 붙는 경우가 많아서(약령시한의약박물관 → "대구약령시한의약박물관",
// 의료선교박물관 → "계명대학교 동산의료원 의료선교박물관") 완전일치만 받으면 실제로
// 존재하는 장소를 통째로 버렸다 — 2026-09-12 실측, 실재율 0/2. 가장 짧은 것을 고르는 건
// 군더더기가 가장 적은 후보를 뜻한다("무인민원발급창구 약령시한의약박물관" 같은 부속 시설 배제).
export function pickBestPlaceMatch<T extends { place_name: string }>(
  name: string,
  documents: T[]
): T | undefined {
  const normalize = (value: string) => value.replace(/\s+/g, "").toLowerCase();
  const target = normalize(name);
  const exact = documents.filter(d => normalize(d.place_name) === target);
  if (exact.length > 0) return exact.length === 1 ? exact[0] : undefined;
  const contains = documents.filter(d => normalize(d.place_name).includes(target));
  return contains.sort((a, b) => normalize(a.place_name).length - normalize(b.place_name).length)[0];
}

// 주소 문자열과 후보 Region 목록으로 가장 적절한 Region을 고른다.
// 먼저 주소 첫 토큰으로 시/도를 잡고("대구" → 대구광역시), 그 시/도에 속한 구/군만
// 토큰 일치로 좁힌다(예: "대구 수성구..." → 수성구). 구/군을 못 찾으면 시/도로 완화한다.
// 구/군 이름은 시/도끼리 겹치므로(서울 중구 vs 대구 중구) 부모 시/도 제한이 필수다 —
// 없으면 서울 중구 장소에 대구 중구 주차 정보가 붙는다.
export function pickRegionForAddress<T extends { id: bigint; name: string; level: string; parentId: bigint | null }>(
  address: string,
  regions: T[]
): T | null {
  const tokens = address.split(" ").filter(Boolean);
  const firstToken = tokens[0];
  if (!firstToken) return null;

  const sido = regions.find((r) => r.level === "시도" && r.name.includes(firstToken));
  if (!sido) return null;

  const district = regions.find(
    (r) => r.level === "구군" && r.parentId === sido.id && tokens.includes(r.name)
  );
  return district ?? sido;
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
