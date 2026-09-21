export function followUpSuggestion(history: { role: "user" | "assistant"; content: string }[]): string {
  if (!history.length || !history.some(t => t.role === "assistant")) return "";
  const used = history.filter(t => t.role === "user").map(t => t.content).join("\n");
  return ["최근 추천과 겹치지 않는 다른 장소를 추천해 줘", "이동 거리가 짧은 코스로 추천해 줘", "비용이 적게 드는 코스로 추천해 줘"]
    .find(text => !used.includes(text)) ?? "";
}
