import { createHash } from "node:crypto";

export function normalizeTourismKeyword(keyword: string) {
  return keyword.trim().replace(/\s+/g, " ").toLowerCase();
}

// KorService2에서 지역을 거르는 파라미터가 오퍼레이션마다 다르다 — 2026-09-13 실측:
//   areaBasedList2  : areaCode=4     → 488건 (정상)
//   searchKeyword2  : areaCode=4     → 항상 0건, lDongRegnCd=27 → 정상
//   searchFestival2 : areaCode=4     → 0건,     lDongRegnCd=27 → 4건
// 키워드/축제 응답은 areacode 필드 자체가 빈 값으로 오고 lDongRegnCd(27=대구)만 채워진다.
// 이걸 몰라서 관광 API 조회가 계속 0건이었고, 그래서 운영시간·요금이 화면에 한 번도
// 표시되지 않았다(저장된 장소 30개 중 fee 0개).
export function tourismRegionParams(operation: string): Record<string, string> {
  return operation === "areaBasedList2" ? { areaCode: "4" } : { lDongRegnCd: "27" };
}

export function tourismCacheKey(keyword: string, limit: number) {
  // version 2: 위 지역 파라미터 수정 전에 캐시된 "0건" 결과를 무효화한다(캐시 TTL 24시간).
  return createHash("sha256")
    .update(JSON.stringify({ version: 2, region: "daegu", keyword: normalizeTourismKeyword(keyword), limit }))
    .digest("hex");
}
