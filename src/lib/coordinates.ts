export type Coordinate = { latitude: number; longitude: number };
export function coordinate(lat: unknown, lng: unknown): Coordinate | null {
  const number = (v: unknown) => typeof v === "number" || (typeof v === "string" && v.trim()) ? Number(v) : NaN;
  const latitude = number(lat), longitude = number(lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && !(latitude === 0 && longitude === 0) ? { latitude, longitude } : null;
}
export function parseCoordinateQuery(params: URLSearchParams): Coordinate | null {
  if (!params.has("latitude") && !params.has("longitude")) return null;
  const point = coordinate(params.get("latitude"), params.get("longitude"));
  if (!point) throw new Error("latitude와 longitude에 유효한 좌표를 함께 입력해 주세요.");
  return point;
}
