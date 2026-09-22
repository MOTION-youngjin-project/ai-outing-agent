export type PlacePhoto = {
  url: string;
  title: string;
  author: string;
  credit: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  capturedAt?: string | null;
  checkedAt?: string;
  source?: "commons" | "official" | "owner";
};

// Upload/modified dates are deliberately not treated as shooting dates.
export function photoCaptureDate(raw: string | undefined, now = Date.now()): string | null {
  const date = raw?.match(/^(\d{4}-\d{2}-\d{2})(?:$|[ T])/u)?.[1];
  if (!date) return null;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date && time <= now ? date : null;
}

export function newestPhoto(photos: PlacePhoto[]): PlacePhoto | null {
  return [...photos].sort((a, b) => (photoCaptureDate(b.capturedAt ?? undefined) ?? "").localeCompare(photoCaptureDate(a.capturedAt ?? undefined) ?? "")) [0] ?? null;
}
