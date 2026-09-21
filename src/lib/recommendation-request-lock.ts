import { createHash } from "node:crypto";

// In-flight only: never reuse completed results. Shared across route reloads in this process.
const state = globalThis as typeof globalThis & { motionRecommendationLocks?: Set<string> };
const locks = state.motionRecommendationLocks ??= new Set<string>();

export function recommendationRequestKey(
  userId: string,
  history: { role: string; content: string }[],
  origin: { latitude: number; longitude: number } | null,
  conversationId: string | null,
): string {
  return createHash("sha256").update(JSON.stringify([
    userId, conversationId, history.map(({ role, content }) => [role, content]),
    origin ? [origin.latitude, origin.longitude] : null,
  ])).digest("hex");
}

export function acquireRecommendationRequest(key: string):
  { acquired: true; release: () => void } | { acquired: false; reason: "duplicate" | "capacity" } {
  if (locks.has(key)) return { acquired: false, reason: "duplicate" };
  if (locks.size >= 1000) return { acquired: false, reason: "capacity" };
  locks.add(key);
  let released = false;
  return { acquired: true, release() {
    if (released) return;
    released = true;
    locks.delete(key);
  } };
}
