import { createHash } from "node:crypto";
import { prisma } from "../prisma";
import { normalizePreferenceTags, preferenceContext } from "../recommendation-preferences";
import type { ChatTurn } from "../agent";
import type { GeoPoint, RecommendationRunResult } from "./recommendations";

const TTL = 5 * 60_000;
const MAX_ENTRIES = 200;
const MAX_ENTRY_BYTES = 128 * 1024;
const entries = new Map<string, { expires: number; result: RecommendationRunResult }>();
export function recommendationCacheKey(userId: string, history: ChatTurn[], origin: GeoPoint | null,
  conversationId: string | null, tags: unknown, now = Date.now()) {
  return createHash("sha256").update(JSON.stringify({ version: 1, userId, conversationId,
    history: history.map(({ role, content }) => [role, content]),
    origin: origin ? [origin.latitude, origin.longitude] : null,
    tags: normalizePreferenceTags(tags), date: new Date(now + 9 * 3600_000).toISOString().slice(0, 10),
  })).digest("hex");
}

export async function readRecommendationCache(userId: string, history: ChatTurn[], origin: GeoPoint | null,
  conversationId: string | null, now = Date.now()) {
  for (const [key, entry] of entries) if (entry.expires <= now) entries.delete(key);
  try {
    const user = await prisma.user.findUnique({ where: { id: BigInt(userId) }, select: { preferredTags: true } });
    if (!user) return { key: null, preferences: undefined, result: null };
    const preferences = preferenceContext(user.preferredTags, history);
    const key = recommendationCacheKey(userId, history, origin, conversationId, user.preferredTags, now);
    const entry = entries.get(key);
    if (entry) {
      // Deleted/expired history must not be resurrected by an in-memory response.
      const run = await prisma.agentRun.findFirst({ where: {
        id: entry.result.agentRunId, userId: BigInt(userId), expiresAt: { gt: new Date(now) },
        status: { in: ["completed", "partial"] },
      }, select: { id: true } });
      if (run) return { key, preferences, result: structuredClone(entry.result) };
      entries.delete(key);
    }
    return { key, preferences, result: null };
  } catch {
    // Unknown preferences/ownership: bypass cache, never reuse a possibly mismatched entry.
    return { key: null, preferences: undefined, result: null };
  }
}

export function storeRecommendationCache(key: string | null, result: RecommendationRunResult, now = Date.now()) {
  if (!key || result.recommendation.needsMoreInfo || !result.recommendation.places?.length || !result.recommendationRouteId) return;
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > MAX_ENTRY_BYTES) return;
  if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value!);
  entries.set(key, { expires: now + TTL, result: structuredClone(result) });
}
