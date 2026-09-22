import { z } from "zod";
import entries from "./data/approved-place-photos.json";
import { photoCaptureDate, type PlacePhoto } from "./place-photo";

const https = z.string().url().refine(raw => {
  const url = new URL(raw);
  return url.protocol === "https:" && !url.username && !url.password;
});
const schema = z.object({
  placeId: z.string().min(1), reviewedAt: z.string().datetime(),
  // Code-reviewed records only. This is not an unmoderated public submission endpoint.
  permissionEvidence: https, source: z.enum(["official", "owner"]),
  url: https, sourceUrl: https, licenseUrl: https,
  title: z.string().min(1).max(500), author: z.string().min(1).max(1500),
  credit: z.string().max(3000), license: z.string().min(1).max(150),
  capturedAt: z.string().nullable(), consentConfirmed: z.literal(true),
});

export function approvedPlacePhotos(placeId: string, records: unknown = entries): PlacePhoto[] {
  if (!Array.isArray(records)) return [];
  return records.flatMap(record => {
    const result = schema.safeParse(record);
    if (!result.success || result.data.placeId !== placeId || Date.parse(result.data.reviewedAt) > Date.now()) return [];
    const entry = result.data;
    return [{ url: entry.url, sourceUrl: entry.sourceUrl, licenseUrl: entry.licenseUrl,
      title: entry.title, author: entry.author, credit: entry.credit, license: entry.license,
      source: entry.source, capturedAt: photoCaptureDate(entry.capturedAt ?? undefined), checkedAt: entry.reviewedAt }];
  });
}
