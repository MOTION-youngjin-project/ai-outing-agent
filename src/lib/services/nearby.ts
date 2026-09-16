import { z } from "zod";
import { estimateWalkMinutes, NEARBY_KINDS, type NearbyKind, type NearbyPlace } from "../nearby";

const Document = z.object({
  id: z.string().min(1), place_name: z.string().min(1),
  category_name: z.string(), road_address_name: z.string(), address_name: z.string(),
  x: z.coerce.number().min(-180).max(180), y: z.coerce.number().min(-90).max(90),
  distance: z.coerce.number().finite().nonnegative(),
});
const cache = new Map<string, { expires: number; promise: Promise<NearbyPlace[]> }>();

export async function searchNearby(latitude: number, longitude: number, kind: NearbyKind, radius: number): Promise<NearbyPlace[]> {
  const apiKey = process.env.KAKAO_API_KEY;
  if (!apiKey) throw new Error("장소 검색 서비스가 준비되지 않았습니다.");
  const key = `${latitude},${longitude},${kind},${radius}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = (async () => {
    const params = new URLSearchParams({ x: String(longitude), y: String(latitude), radius: String(radius), sort: "distance", size: "15" });
    const category = kind === "food" ? "FD6" : "CE7";
    const endpoint = kind === "shop" || kind === "walk" ? "keyword" : "category";
    if (kind !== "shop" && kind !== "walk") params.set("category_group_code", category);
    const keywords = kind === "shop" ? ["소품샵", "액세서리"] : kind === "walk" ? ["공원", "산책로"] : [null];
    const responses = await Promise.all(keywords.map(async keyword => {
      const query = new URLSearchParams(params);
      if (keyword) query.set("query", keyword);
      const response = await fetch(`https://dapi.kakao.com/v2/local/search/${endpoint}.json?${query}`, {
        headers: { Authorization: `KakaoAK ${apiKey}` }, signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("주변 장소 조회에 실패했습니다.");
      const body = await response.json();
      if (!Array.isArray(body?.documents)) throw new Error("주변 장소 응답을 확인하지 못했습니다.");
      return body.documents as unknown[];
    }));
    const seen = new Set<string>();
    return responses.flat().flatMap((raw: unknown) => {
      const parsed = Document.safeParse(raw);
      if (!parsed.success) return [];
      const d = parsed.data;
      if (seen.has(d.id) || d.distance > radius || (d.x === 0 && d.y === 0)) return [];
      if (kind === "shop" && !/소품|액세서리|악세사리|장신구/.test(d.category_name + " " + d.place_name)) return [];
      if (kind === "walk" && !/공원|산책|수목원|둘레길|강변|수변|호수|광장|숲길|해변|유원지/.test(d.category_name + " " + d.place_name)) return [];
      seen.add(d.id);
      return [{ id: d.id, name: d.place_name, kind, address: d.road_address_name || d.address_name,
        latitude: d.y, longitude: d.x, distanceM: Math.round(d.distance), estimatedWalkMinutes: estimateWalkMinutes(d.distance), mapUrl: `https://place.map.kakao.com/${encodeURIComponent(d.id)}` }];
    }).sort((a: NearbyPlace, b: NearbyPlace) => a.distanceM - b.distanceM).slice(0, 3);
  })();
  // 요청을 합쳐 같은 좌표의 중복 호출을 줄인다. 실패 결과는 캐시하지 않는다.
  if (cache.size >= 300) cache.delete(cache.keys().next().value!);
  cache.set(key, { expires: Date.now() + 30 * 60 * 1000, promise });
  try { return await promise; } catch (error) { cache.delete(key); throw error; }
}

export { NEARBY_KINDS };
