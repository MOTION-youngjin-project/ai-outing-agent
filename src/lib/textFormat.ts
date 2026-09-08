// AI 코멘트 카드가 "굵은 첫 문장 + 설명 본문" 구조라 첫 문장을 헤드라인으로 뽑아 쓴다.
// ResultsScreen(message)과 DetailScreen(reason) 둘 다에서 쓴다.
export function splitHeadline(text: string): { headline: string; body: string } {
  const splitAt = text.search(/[.!?]\s/);
  if (splitAt <= 0) return { headline: text, body: "" };
  return { headline: text.slice(0, splitAt + 1), body: text.slice(splitAt + 1).trim() };
}
