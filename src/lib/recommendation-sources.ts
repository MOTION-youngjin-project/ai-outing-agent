export type RecommendationSource = {
  id: string;
  documentTitle: string;
  page: number | null;
  sourceUrl: string | null;
};

export function safeSourceUrl(value: string | null): string | null {
  try {
    const url = new URL(value ?? "");
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function resolveSources(ids: string[] | undefined, available: Map<string, RecommendationSource>) {
  return [...new Set(ids ?? [])].flatMap((id) => {
    const source = available.get(id);
    return source ? [{ ...source, sourceUrl: safeSourceUrl(source.sourceUrl) }] : [];
  });
}
