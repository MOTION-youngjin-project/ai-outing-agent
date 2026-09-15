export const NEARBY_KINDS = ["food", "cafe", "shop", "walk"] as const;
export type NearbyKind = typeof NEARBY_KINDS[number];
export const NEARBY_LABELS: Record<NearbyKind, string> = { food: "식당", cafe: "카페", shop: "소품·액세서리샵", walk: "공원·산책" };
export type NearbyPlace = {
  id: string; name: string; kind: NearbyKind; address: string;
  latitude: number; longitude: number; distanceM: number; estimatedWalkMinutes: number; mapUrl: string;
};

export function isFoodCategory(category?: string | null): boolean {
  return !!category && /음식점|한식|중식|일식|양식|분식|뷔페|패스트푸드|치킨|피자/.test(category);
}

export function nearbyKindsForCategory(category?: string | null): NearbyKind[] {
  return isFoodCategory(category) ? ["walk", "cafe"] : ["food", "cafe", "shop"];
}

export function estimateWalkMinutes(distanceM: number): number {
  return Math.max(1, Math.ceil(distanceM / 80));
}
