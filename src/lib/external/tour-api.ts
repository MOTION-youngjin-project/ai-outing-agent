import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { normalizeTourismKeyword, tourismCacheKey } from "@/lib/external/tour-api-cache";
import { coordinate } from "@/lib/coordinates";

const BASE_URL = "https://apis.data.go.kr/B551011/KorService2";
const CACHE_MS = 24 * 60 * 60 * 1000;

type TourItem = Record<string, string>;

export type TourismPlace = {
  contentId: string;
  contentTypeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string;
  homepage?: string;
  description?: string;
  imageUrl?: string;
  operatingHours?: string;
  fee?: string;
  parking?: string;
  petInfo?: string;
  closedDays?: string;
};

export type TourismCacheStatus = "hit" | "miss" | "stale";

export type TourismSearchResult = {
  data: TourismPlace[];
  cache: TourismCacheStatus;
  cachedAt: string;
  expiresAt: string;
};

function apiKey() {
  const stored = (process.env.DATA_GO_KR_API_KEY || process.env.TOUR_API_KEY)?.trim();
  if (!stored) throw new Error("TOUR_API_KEY가 설정되지 않았습니다.");
  try {
    return decodeURIComponent(stored);
  } catch {
    return stored;
  }
}

function items(body: unknown): TourItem[] {
  const value = body as { response?: { body?: { items?: { item?: TourItem | TourItem[] } | string } } };
  const item = typeof value.response?.body?.items === "object" ? value.response.body.items.item : undefined;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

async function request(operation: string, input: Record<string, string>) {
  const params = new URLSearchParams({
    serviceKey: apiKey(), MobileOS: "ETC", MobileApp: "Motion", _type: "json", ...input,
  });
  const response = await fetch(`${BASE_URL}/${operation}?${params}`, {
    signal: AbortSignal.timeout(12_000), cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`TourAPI HTTP ${response.status}`);
  const json = JSON.parse(text) as { resultCode?: string; resultMsg?: string; response?: { header?: { resultCode?: string; resultMsg?: string } } };
  const code = json.response?.header?.resultCode ?? json.resultCode;
  if (code !== "0000") throw new Error(`TourAPI 오류(${code}): ${json.response?.header?.resultMsg ?? json.resultMsg}`);
  return json;
}

function firstValue(item: TourItem, names: string[]) {
  for (const name of names) if (item[name]?.trim()) return item[name].trim();
  return undefined;
}

function cleanHtml(value?: string) {
  return value?.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function districtFromAddress(address: string) {
  return ["중구", "동구", "서구", "남구", "북구", "수성구", "달서구", "달성군", "군위군"].find((name) => address.includes(` ${name} `));
}

function categoryName(contentTypeId: string) {
  return ({ "12": "관광지", "14": "문화시설", "15": "축제·행사", "25": "여행코스", "28": "레포츠", "32": "숙박", "38": "쇼핑", "39": "음식점" } as Record<string, string>)[contentTypeId] ?? "관광정보";
}

async function enrich(base: TourItem): Promise<{ result: TourismPlace; raw: Record<string, unknown>; images: TourItem[] }> {
  const commonPromise = request("detailCommon2", { contentId: base.contentid }).catch(() => null);
  const introPromise = request("detailIntro2", { contentId: base.contentid, contentTypeId: base.contenttypeid }).catch(() => null);
  const imagePromise = request("detailImage2", { contentId: base.contentid }).catch(() => null);
  const petPromise = request("detailPetTour2", { contentId: base.contentid }).catch(() => null);
  const [commonBody, introBody, imageBody, petBody] = await Promise.all([commonPromise, introPromise, imagePromise, petPromise]);
  const common = commonBody ? items(commonBody)[0] ?? {} : {};
  const intro = introBody ? items(introBody)[0] ?? {} : {};
  const images = imageBody ? items(imageBody) : [];
  const pet = petBody ? items(petBody)[0] ?? {} : {};
  const merged = { ...base, ...common };
  const operatingHours = firstValue(intro, ["usetime", "usetimeculture", "opentimefood", "checkintime", "playtime", "opentime"]);
  const fee = firstValue(intro, ["usefee", "usefeeculture", "usetimefestival"]);
  const parking = firstValue(intro, ["parking", "parkingculture", "parkingfood", "parkingleports", "parkinglodging"]);
  const petInfo = firstValue(pet, ["acmpyTypeCd", "acmpyPsblCpam", "etcAcmpyInfo", "relaPosesFclty"]);
  return {
    result: {
      contentId: merged.contentid, contentTypeId: merged.contenttypeid, name: merged.title,
      address: [merged.addr1, merged.addr2].filter(Boolean).join(" "),
      latitude: Number(merged.mapy), longitude: Number(merged.mapx), phone: merged.tel || undefined,
      homepage: cleanHtml(merged.homepage), description: cleanHtml(merged.overview),
      imageUrl: merged.firstimage || images[0]?.originimgurl || undefined,
      operatingHours: cleanHtml(operatingHours), fee: cleanHtml(fee), parking: cleanHtml(parking), petInfo: cleanHtml(petInfo),
      closedDays: cleanHtml(firstValue(intro, ["restdate", "restdateculture", "restdatefood", "restdateleports", "restdateshopping"])),
    },
    raw: { base, common, intro, pet }, images,
  };
}

async function storeTourismPlace(data: Awaited<ReturnType<typeof enrich>>) {
  const source = await prisma.dataSource.upsert({
    where: { code: "TOUR_API" },
    update: { enabled: true, baseUrl: BASE_URL },
    create: { code: "TOUR_API", name: "한국관광공사 TourAPI", sourceType: "open_api", baseUrl: BASE_URL },
  });
  const existing = await prisma.placeSourceRecord.findUnique({
    where: { sourceId_externalPlaceKey: { sourceId: source.id, externalPlaceKey: data.result.contentId } },
  });
  const district = districtFromAddress(data.result.address);
  const region = district ? await prisma.region.findFirst({ where: { name: district, level: "구군" } }) : null;
  const payload = JSON.parse(JSON.stringify(data.raw));
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const placeData = {
    regionId: region?.id, name: data.result.name, normalizedName: data.result.name.replace(/\s+/g, "").toLowerCase(),
    categorySummary: categoryName(data.result.contentTypeId), roadAddress: data.result.address || undefined,
    latitude: data.result.latitude, longitude: data.result.longitude, phone: data.result.phone,
    websiteUrl: data.result.homepage, shortDescription: data.result.description?.slice(0, 1000),
    description: data.result.description, parkingAvailable: data.result.parking ? !/없음|불가/.test(data.result.parking) : undefined,
    lastVerifiedAt: new Date(), updatedAt: new Date(),
  };
  const place = existing
    ? await prisma.place.update({ where: { id: existing.placeId }, data: placeData })
    : await prisma.place.create({ data: placeData });
  await prisma.placeSourceRecord.upsert({
    where: { sourceId_externalPlaceKey: { sourceId: source.id, externalPlaceKey: data.result.contentId } },
    update: { placeId: place.id, rawPayloadJson: payload, payloadHash, fetchedAt: new Date(), expiresAt: new Date(Date.now() + CACHE_MS) },
    create: { placeId: place.id, sourceId: source.id, externalPlaceKey: data.result.contentId, rawPayloadJson: payload, payloadHash, expiresAt: new Date(Date.now() + CACHE_MS) },
  });
  const allImages = data.images.length ? data.images : data.result.imageUrl ? [{ serialnum: `${data.result.contentId}-main`, originimgurl: data.result.imageUrl, smallimageurl: data.result.imageUrl, imgname: data.result.name, cpyrhtDivCd: "" }] : [];
  await Promise.all(allImages.slice(0, 10).map((image, index) => prisma.placeImage.upsert({
    where: { sourceId_sourceImageKey: { sourceId: source.id, sourceImageKey: image.serialnum } },
    update: { originalUrl: image.originimgurl, thumbnailUrl: image.smallimageurl || undefined, altText: image.imgname || data.result.name, sortOrder: index },
    create: { placeId: place.id, sourceId: source.id, sourceImageKey: image.serialnum, originalUrl: image.originimgurl, thumbnailUrl: image.smallimageurl || undefined, altText: image.imgname || data.result.name, sortOrder: index, isPrimary: index === 0, licenseInfo: image.cpyrhtDivCd || undefined },
  })));
  if (data.result.parking) await prisma.placeFacility.upsert({ where: { placeId_facilityCode: { placeId: place.id, facilityCode: "parking" } }, update: { available: !/없음|불가/.test(data.result.parking), detail: data.result.parking.slice(0, 500), verifiedAt: new Date() }, create: { placeId: place.id, facilityCode: "parking", available: !/없음|불가/.test(data.result.parking), detail: data.result.parking.slice(0, 500), verifiedAt: new Date() } });
  if (data.result.petInfo) await prisma.placeFacility.upsert({ where: { placeId_facilityCode: { placeId: place.id, facilityCode: "pet" } }, update: { available: true, detail: data.result.petInfo.slice(0, 500), verifiedAt: new Date() }, create: { placeId: place.id, facilityCode: "pet", available: true, detail: data.result.petInfo.slice(0, 500), verifiedAt: new Date() } });
  return data.result;
}

async function fetchAndStoreDaeguTourism(keyword = "", limit = 5) {
  const size = Math.min(Math.max(limit, 1), 10);
  const operation = keyword.trim() ? "searchKeyword2" : "areaBasedList2";
  const body = await request(operation, { areaCode: "4", numOfRows: String(size), pageNo: "1", arrange: "A", ...(keyword.trim() ? { keyword: keyword.trim() } : {}) });
  const detailed = await Promise.all(items(body).filter(item => item.contentid && item.title && coordinate(item.mapy, item.mapx)).slice(0, size).map(enrich));
  return Promise.all(detailed.filter(item => coordinate(item.result.latitude, item.result.longitude)).map(storeTourismPlace));
}

export async function searchDaeguTourismCached(keyword = "", limit = 5): Promise<TourismSearchResult> {
  const size = Math.min(Math.max(limit, 1), 10);
  const normalizedKeyword = normalizeTourismKeyword(keyword);
  const cacheKey = tourismCacheKey(normalizedKeyword, size);
  const cached = await prisma.tourApiQueryCache.findUnique({ where: { cacheKey } });
  const now = new Date();

  if (cached && cached.expiresAt > now) {
    return {
      data: cached.payloadJson as TourismPlace[],
      cache: "hit",
      cachedAt: cached.fetchedAt.toISOString(),
      expiresAt: cached.expiresAt.toISOString(),
    };
  }

  try {
    const data = await fetchAndStoreDaeguTourism(keyword, size);
    const fetchedAt = new Date();
    const expiresAt = new Date(fetchedAt.getTime() + CACHE_MS);
    const payloadJson = JSON.parse(JSON.stringify(data));
    await prisma.tourApiQueryCache.upsert({
      where: { cacheKey },
      update: { keyword: normalizedKeyword, resultLimit: size, payloadJson, fetchedAt, expiresAt },
      create: { cacheKey, keyword: normalizedKeyword, resultLimit: size, payloadJson, fetchedAt, expiresAt },
    });
    return { data, cache: "miss", cachedAt: fetchedAt.toISOString(), expiresAt: expiresAt.toISOString() };
  } catch (error) {
    if (cached) {
      return {
        data: cached.payloadJson as TourismPlace[],
        cache: "stale",
        cachedAt: cached.fetchedAt.toISOString(),
        expiresAt: cached.expiresAt.toISOString(),
      };
    }
    throw error;
  }
}

export async function searchAndStoreDaeguTourism(keyword = "", limit = 5) {
  return (await searchDaeguTourismCached(keyword, limit)).data;
}

export async function syncDaeguFestivals(limit = 10) {
  const festivalItems = await fetchDaeguFestivals(limit);
  const source = await prisma.dataSource.upsert({ where: { code: "TOUR_API" }, update: { enabled: true }, create: { code: "TOUR_API", name: "한국관광공사 TourAPI", sourceType: "open_api", baseUrl: BASE_URL } });
  for (const event of festivalItems) {
    const date = (value?: string) => value && /^\d{8}$/.test(value) ? new Date(`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T00:00:00+09:00`) : undefined;
    await prisma.culturalEvent.upsert({
      where: { sourceId_sourceEventKey: { sourceId: source.id, sourceEventKey: event.contentid } },
      update: { title: event.title, startAt: date(event.eventstartdate), endAt: date(event.eventenddate), syncedAt: new Date() },
      create: { sourceId: source.id, sourceEventKey: event.contentid, title: event.title, genre: "축제·행사", startAt: date(event.eventstartdate), endAt: date(event.eventenddate) },
    });
  }
  return festivalItems;
}

export async function fetchDaeguFestivals(limit = 10) {
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const body = await request("searchFestival2", { areaCode: "4", eventStartDate: today, numOfRows: String(Math.min(Math.max(limit, 1), 20)), pageNo: "1", arrange: "A" });
  return items(body);
}
