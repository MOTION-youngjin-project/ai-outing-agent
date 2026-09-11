export type TourismEvidence = {
  name: string; address: string; operatingHours?: string; fee?: string; closedDays?: string;
  cachedAt: string; expiresAt: string; cache: "hit" | "miss" | "stale";
};
export type PlaceVerification = {
  source: "tour_api" | "pdf" | "unverified";
  fetchedAt: string | null; expiresAt: string | null;
  stale: boolean; verificationRequired: true;
  fields: { operatingHours: boolean; fee: boolean; closedDays: boolean };
};

export function verifyPlace<T extends { name: string; address?: string; operatingHours?: string; fee?: string; sources?: unknown[] }>(place: T, evidence: TourismEvidence[]) {
  const normalize = (text: string) => text.replace(/\s+/g, "").toLowerCase();
  const candidates = evidence.filter((entry) => normalize(entry.name) === normalize(place.name));
  const matches = place.address ? candidates.filter((entry) => normalize(entry.address) === normalize(place.address!)) : candidates;
  const match = matches.length === 1 ? matches[0] : undefined;
  const verification: PlaceVerification = {
    source: match ? "tour_api" : place.sources?.length ? "pdf" : "unverified",
    fetchedAt: match?.cachedAt ?? null, expiresAt: match?.expiresAt ?? null,
    stale: !!match && (match.cache === "stale" || Date.parse(match.expiresAt) <= Date.now()),
    verificationRequired: true,
    fields: { operatingHours: !!match?.operatingHours, fee: !!match?.fee, closedDays: !!match?.closedDays },
  };
  // 변동 정보는 해당 장소와 일치하는 실제 관광 API 응답만 사용한다.
  return { ...place, operatingHours: match?.operatingHours, fee: match?.fee, closedDays: match?.closedDays, verification };
}

export function verificationText(value?: PlaceVerification) {
  if (!value) return "자료 조회 시각 미확인 · 방문 전 확인 필요";
  const stale = value.stale || (!!value.expiresAt && Date.parse(value.expiresAt) <= Date.now());
  const origin = value.source === "tour_api" ? `관광정보 자료 조회: ${value.fetchedAt}${stale ? " · 유효기간이 지난 자료" : ""}`
    : value.source === "pdf" ? "PDF 참고 자료 · 현재 영업정보 미확인" : "영업정보 출처 미확인";
  const missing = [!value.fields.operatingHours && "운영시간", !value.fields.fee && "가격", !value.fields.closedDays && "휴무"].filter(Boolean);
  return `${origin}${missing.length ? ` · ${missing.join("·")} 미확인` : ""} · 방문 전 확인 필요`;
}
