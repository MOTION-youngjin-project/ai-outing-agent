import { createHash, randomBytes } from "node:crypto";
export const GUEST_COOKIE = "motion_guest_recommendations";
export function guestToken(value?: string) {
  return value && /^[a-f0-9]{64}$/.test(value) ? value : randomBytes(32).toString("hex");
}
export function guestHash(value?: string) {
  return value && /^[a-f0-9]{64}$/.test(value) ? createHash("sha256").update(value).digest("hex") : null;
}
export function ownerWhere(userId?: string | null, sessionKeyHash?: string | null) {
  if (userId && /^\d+$/.test(userId)) return { userId: BigInt(userId) };
  if (sessionKeyHash) return { userId: null, sessionKeyHash };
  return { id: "no-owner" };
}
