import { createHash } from "node:crypto";

export function normalizeTourismKeyword(keyword: string) {
  return keyword.trim().replace(/\s+/g, " ").toLowerCase();
}

export function tourismCacheKey(keyword: string, limit: number) {
  return createHash("sha256")
    .update(JSON.stringify({ version: 1, areaCode: "4", keyword: normalizeTourismKeyword(keyword), limit }))
    .digest("hex");
}
