export const PREFERENCE_TAGS = ["실내", "야외", "데이트", "저비용"] as const;
type Turn = { role: "user" | "assistant"; content: string };

export function normalizePreferenceTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return PREFERENCE_TAGS.filter(tag => value.includes(tag));
}

// Explicit user conditions (including negations) belong to the conversation, not defaults.
// Suppress the whole dimension rather than guessing the meaning of a negation.
export function preferenceContext(value: unknown, history: Turn[]): string | undefined {
  const text = history.filter(t => t.role === "user").map(t => t.content).join("\n");
  if (/취향.*(?:무시|제외|반영하지)|저장.*(?:무시|반영하지)/.test(text)) return undefined;
  const tags = normalizePreferenceTags(value).filter(tag => {
    if (tag === "실내" || tag === "야외") return !/실내|실외|야외|등산|산책|트레킹|걷기/.test(text);
    if (tag === "데이트") return !/혼자|아이|아기|부모|가족|친구|동료|연인|애인|커플|데이트|남자친구|여자친구/.test(text);
    return !/예산|가격|비용|무료|저렴|저비용|가성비|비싸|돈|\d\s*만?\s*원/.test(text);
  });
  // Both environment tags convey no preference; omit them to save input.
  const effective = tags.includes("실내") && tags.includes("야외")
    ? tags.filter(tag => tag !== "실내" && tag !== "야외") : tags;
  if (!effective.length) return undefined;
  return `[저장된 기본 취향] ${effective.join(",")}. 약한 선호로만 참고하고 현재 요청·대화의 명시 조건을 우선한다. 목적에 맞지 않으면 무시하고, 취향 확인만을 위한 추가 질문은 하지 않는다.`;
}

export async function loadPreferenceContext(
  userId: bigint | undefined,
  history: Turn[],
  load: (id: bigint) => Promise<unknown>,
): Promise<string | undefined> {
  if (userId === undefined) return undefined;
  try { return preferenceContext(await load(userId), history); }
  catch { return undefined; } // Optional personalization must not block recommendations.
}
