import { z } from "zod";
import type { PlacePhoto } from "../place-photo";
import { newestPhoto, photoCaptureDate } from "../place-photo";

const USER_AGENT = "MotionPlacePhotos/1.0 (https://wa26bteam02.yjjob.kr/)";
const value = z.object({ value: z.string() });
const entitySchema = z.object({
  labels: z.record(z.string(), value).optional(),
  aliases: z.record(z.string(), z.array(value)).optional(),
  claims: z.record(z.string(), z.array(z.object({
    rank: z.string().optional(),
    mainsnak: z.object({ datavalue: z.object({ value: z.unknown() }).optional() }),
  }))).optional(),
});
type Entity = z.infer<typeof entitySchema>;
type PlacePoint = { name: string; latitude: number; longitude: number };
const normalize = (s: string) => s.normalize("NFKC").replace(/\s+/g, "").toLowerCase();

export function matchedPhotoFile(entity: Entity, place: PlacePoint): string | null {
  const names = [...Object.values(entity.labels ?? {}).map(v => v.value), ...Object.values(entity.aliases ?? {}).flat().map(v => v.value)];
  if (!names.some(name => normalize(name) === normalize(place.name))) return null;
  const coordinates = entity.claims?.P625?.filter(c => c.rank !== "deprecated").map(c => c.mainsnak.datavalue?.value) ?? [];
  const near = coordinates.some(raw => {
    const parsed = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), globe: z.string() }).safeParse(raw);
    if (!parsed.success || !parsed.data.globe.endsWith("/Q2")) return false;
    const lat = (parsed.data.latitude - place.latitude) * Math.PI / 180;
    const lon = (parsed.data.longitude - place.longitude) * Math.PI / 180;
    const a = Math.sin(lat / 2) ** 2 + Math.cos(place.latitude * Math.PI / 180) * Math.cos(parsed.data.latitude * Math.PI / 180) * Math.sin(lon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))) <= 300;
  });
  if (!near) return null;
  const file = entity.claims?.P18?.find(c => c.rank !== "deprecated" && typeof c.mainsnak.datavalue?.value === "string")?.mainsnak.datavalue?.value;
  return typeof file === "string" && /\.(jpe?g|png|webp)$/i.test(file) ? file : null;
}

function plain(text: string): string {
  return text.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();
}
function allowedUrl(raw: string, host: string): string | null {
  try { const u = new URL(raw); return u.protocol === "https:" && u.hostname === host && !u.username && !u.password ? u.href : null; }
  catch { return null; }
}
export function licensedPhoto(raw: unknown, file: string): PlacePhoto | null {
  const parsed = z.object({ thumburl: z.string(), extmetadata: z.record(z.string(), z.object({ value: z.coerce.string() })) }).safeParse(raw);
  if (!parsed.success) return null;
  const m = parsed.data.extmetadata;
  const url = allowedUrl(parsed.data.thumburl, "upload.wikimedia.org") ?? allowedUrl(parsed.data.thumburl, "thumb.wikimedia.org");
  const rawLicense = allowedUrl(m.LicenseUrl?.value ?? "", "creativecommons.org");
  const licenseUrl = rawLicense ? rawLicense.replace(/\/?$/, "/") : null;
  const licenses: Record<string, string> = {
    "https://creativecommons.org/licenses/by/4.0/": "CC BY 4.0",
    "https://creativecommons.org/licenses/by-sa/4.0/": "CC BY-SA 4.0",
    "https://creativecommons.org/licenses/by/3.0/": "CC BY 3.0",
    "https://creativecommons.org/licenses/by-sa/3.0/": "CC BY-SA 3.0",
    "https://creativecommons.org/publicdomain/zero/1.0/": "CC0 1.0",
  };
  const license = licenseUrl && licenses[licenseUrl];
  const author = plain(m.Artist?.value ?? "");
  const credit = plain([m.Credit?.value, m.Attribution?.value, m.Copyright?.value].filter(Boolean).join(" · "));
  // Unknown/restricted licenses and incomplete attribution fail closed.
  if (!url || !license || !licenseUrl || !author || author.length > 1500 || credit.length > 3000 || plain(m.Restrictions?.value ?? "")) return null;
  return { url, license, licenseUrl, author, credit, title: file, source: "commons",
    capturedAt: photoCaptureDate(plain(m.DateTimeOriginal?.value ?? "")), checkedAt: new Date().toISOString(),
    sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(`File:${file}`)}` };
}

async function json(url: URL, signal: AbortSignal) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal });
  if (!response.ok) throw Error(`Photo provider ${response.status}`);
  return response.json();
}

async function fetchRepresentativePhoto(place: PlacePoint): Promise<PlacePhoto | null> {
  const signal = AbortSignal.timeout(10000);
  const searchUrl = new URL("https://www.wikidata.org/w/api.php");
  searchUrl.search = new URLSearchParams({ action: "wbsearchentities", search: place.name, language: "ko", format: "json", limit: "5" }).toString();
  const search = z.object({ search: z.array(z.object({ id: z.string().regex(/^Q\d+$/) })) }).parse(await json(searchUrl, signal));
  if (!search.search.length) return null;
  const entitiesUrl = new URL("https://www.wikidata.org/w/api.php");
  entitiesUrl.search = new URLSearchParams({ action: "wbgetentities", ids: search.search.map(e => e.id).join("|"), props: "labels|aliases|claims", languages: "ko|en", format: "json" }).toString();
  const entities = z.object({ entities: z.record(z.string(), entitySchema) }).parse(await json(entitiesUrl, signal));
  const files = Object.values(entities.entities).map(entity => matchedPhotoFile(entity, place)).filter((f): f is string => !!f);
  if (files.length !== 1) return null; // Ambiguous places are not guessed.
  const commons = new URL("https://commons.wikimedia.org/w/api.php");
  commons.search = new URLSearchParams({ action: "query", titles: `File:${files[0]}`, prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "640", format: "json" }).toString();
  const data = z.object({ query: z.object({ pages: z.record(z.string(), z.object({ imageinfo: z.array(z.unknown()).optional() })) }) }).parse(await json(commons, signal));
  return licensedPhoto(Object.values(data.query.pages)[0]?.imageinfo?.[0], files[0]);
}

// Additional Commons files: both proximity and an exact normalized name in the file metadata.
// A nearby photo alone is never enough (it may depict a different business).
export async function fetchNearbyPhotos(place: PlacePoint): Promise<PlacePhoto[]> {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({ action: "query", generator: "geosearch", ggscoord: `${place.latitude}|${place.longitude}`,
    ggsradius: "300", ggsnamespace: "6", ggslimit: "12", prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "640", format: "json" }).toString();
  const data = z.object({ query: z.object({ pages: z.record(z.string(), z.object({ title: z.string(),
    imageinfo: z.array(z.object({ extmetadata: z.record(z.string(), z.object({ value: z.coerce.string() })).optional() }).passthrough()).optional(),
  })) }).optional() }).parse(await json(url, AbortSignal.timeout(8000)));
  const name = normalize(place.name);
  if (name.length < 3) return [];
  return Object.values(data.query?.pages ?? {}).flatMap(page => {
    const info = page.imageinfo?.[0];
    if (!info) return [];
    const description = plain(info.extmetadata?.ImageDescription?.value ?? "");
    const title = page.title.replace(/^File:/, "");
    if (!/\.(jpe?g|png|webp)$/i.test(title) || !normalize(`${title} ${description}`).includes(name)) return [];
    const photo = licensedPhoto(info, title);
    return photo ? [photo] : [];
  });
}

export async function fetchLicensedPlacePhoto(place: PlacePoint): Promise<PlacePhoto | null> {
  const [representative, nearby] = await Promise.all([
    fetchRepresentativePhoto(place).catch(() => null), fetchNearbyPhotos(place).catch(() => []),
  ]);
  return newestPhoto([...(representative ? [representative] : []), ...nearby]);
}

const cache = new Map<string, { until: number; photo: PlacePhoto | null }>();
const pending = new Map<string, Promise<PlacePhoto | null>>();
export async function getLicensedPlacePhoto(place: PlacePoint) {
  const key = JSON.stringify(place);
  for (const [k, entry] of cache) if (entry.until <= Date.now()) cache.delete(k);
  const cached = cache.get(key);
  if (cached) return cached.photo;
  const existing = pending.get(key);
  if (existing) return existing;
  if (pending.size >= 20) return null;
  const request = fetchLicensedPlacePhoto(place).catch(() => null).then(photo => {
    if (cache.size >= 300) cache.delete(cache.keys().next().value!);
    cache.set(key, { until: Date.now() + (photo ? 3600_000 : 300_000), photo });
    return photo;
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
