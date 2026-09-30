// AI 코멘트 카드가 "굵은 첫 문장 + 설명 본문" 구조라 첫 문장을 헤드라인으로 뽑아 쓴다.
// ResultsScreen(message)과 DetailScreen(reason) 둘 다에서 쓴다.
export function splitHeadline(text: string): { headline: string; body: string } {
  const splitAt = text.search(/[.!?]\s/);
  if (splitAt <= 0) return { headline: text, body: "" };
  return { headline: text.slice(0, splitAt + 1), body: text.slice(splitAt + 1).trim() };
}

// 방문 예정일은 시각 없이 날짜만 다룬다. "2026-09-20" -> "9월 20일 (일)".
// UTC 자정으로 만들어 파싱하고 UTC로 읽는 이유: 로컬 타임존이 UTC보다 뒤(예: UTC-5)면
// new Date("2026-09-20")를 로컬로 읽을 때 하루 앞당겨져 19일로 보인다.
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function formatPlannedDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}

// 오늘을 사용자의 로컬 기준 "YYYY-MM-DD"로. 지난 예정 판정에 쓴다 —
// toISOString()을 그냥 쓰면 UTC 기준이라 밤 시간대에 날짜가 하루 어긋난다.
export function todayIso(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
