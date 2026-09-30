// 네이버 Directions는 자동차 경로만 준다 — 구간이 도보로 다닐 만큼 가까운지는 실제
// 이동수단 데이터가 없어 거리로 어림잡는다(estimateWalkMinutes와 같은 공식·평균 도보
// 4km/h, src/lib/tools/parking.ts는 langchain 서버 도구라 클라이언트 번들에 못 끌어옴).
// CourseCard/MapScreen 둘 다 코스 구간 표시에 쓴다.
export const WALK_DISTANCE_THRESHOLD_M = 1200;

export function estimateWalkMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / 67));
}
