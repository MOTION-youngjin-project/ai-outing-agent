import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getOrCreateDataSource } from "./shared";
import { pickBestPlaceMatch, pickRegionForAddress } from "./matching";
import type { Place } from "../../../generated/prisma/client";

// NAVER API HUB - 지역 검색
// https://api.ncloud-docs.com/docs/naver-api-hub-search-local
const NAVER_LOCAL_URL = "https://naverapihub.apigw.ntruss.com/search/v1/local";

type PlaceSearchDocument = {
  id: string;
  place_name: string;
  category_name: string;
  road_address_name: string;
  address_name: string;
  phone: string;
  place_url: string;
  x: string; // 경도
  y: string; // 위도
};

type NaverLocalItem = {
  title?: string;
  link?: string;
  category?: string;
  telephone?: string;
  address?: string;
  roadAddress?: string;
  mapx?: string;
  mapy?: string;
};

function plainText(value = "") {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

function coordinate(value?: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return Number.NaN;
  return Math.abs(number) > 180 ? number / 10_000_000 : number;
}

function toPlaceSearchDocument(item: NaverLocalItem): PlaceSearchDocument {
  const name = plainText(item.title);
  const address = plainText(item.address);
  const roadAddress = plainText(item.roadAddress);
  const externalKey = item.link || crypto.createHash("sha256").update(`${name}|${roadAddress || address}`).digest("hex");
  return {
    id: externalKey,
    place_name: name,
    category_name: plainText(item.category),
    road_address_name: roadAddress,
    address_name: address,
    phone: plainText(item.telephone),
    place_url: item.link ?? "",
    x: String(coordinate(item.mapx)),
    y: String(coordinate(item.mapy)),
  };
}

async function fetchOnce(query: string, clientId: string, clientSecret: string): Promise<PlaceSearchDocument[]> {
  const params = new URLSearchParams({ query, display: "5", start: "1", sort: "random" });
  const res = await fetch(`${NAVER_LOCAL_URL}?${params}`, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret,
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`네이버 지역 검색 API 오류(${res.status}): ${body}`);
  }

  const data = await res.json();
  return ((data?.items ?? []) as NaverLocalItem[]).map(toPlaceSearchDocument);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ponytail: 다른 공공데이터 API들과 동일하게 최대 3회 재시도.
async function fetchPlaces(query: string): Promise<PlaceSearchDocument[]> {
  const clientId = process.env.NAVER_API_HUB_CLIENT_ID;
  const clientSecret = process.env.NAVER_API_HUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("NAVER_API_HUB_CLIENT_ID 또는 NAVER_API_HUB_CLIENT_SECRET이 설정되지 않았습니다.");
  }

  const MAX_ATTEMPTS = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchOnce(query, clientId, clientSecret);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) await sleep(500);
    }
  }
  throw lastError;
}

function normalizePlaceName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

// ponytail: 장소 상세정보는 자주 안 바뀌므로 24시간 TTL. 필요해지면 조정.
const PLACE_TTL_MS = 24 * 60 * 60 * 1000;

export interface CachedPlace {
  id: string;
  name: string;
  roadAddress: string | null;
  latitude: number;
  longitude: number;
  categorySummary: string | null;
  phone: string | null;
  websiteUrl: string | null;
}

function toCachedPlace(place: Place): CachedPlace {
  return {
    id: place.publicId,
    name: place.name,
    roadAddress: place.roadAddress,
    latitude: place.latitude.toNumber(),
    longitude: place.longitude.toNumber(),
    categorySummary: place.categorySummary,
    phone: place.phone,
    websiteUrl: place.websiteUrl,
  };
}

async function findRegionByAddress(address: string) {
  const regions = await prisma.region.findMany({ where: { level: { in: ["sido", "sigungu"] } } });
  return pickRegionForAddress(address, regions);
}

// 네이버 검색 결과 하나를 places/place_source_records에 cache-aside로 upsert하고 Place 행을 반환한다.
async function upsertPlaceFromDoc(doc: PlaceSearchDocument, sourceId: bigint): Promise<Place> {
  const existingRecord = await prisma.placeSourceRecord.findUnique({
    where: { sourceId_externalPlaceKey: { sourceId, externalPlaceKey: doc.id } },
    include: { place: true },
  });

  const isFresh = existingRecord?.expiresAt ? existingRecord.expiresAt > new Date() : false;
  if (existingRecord && isFresh) return existingRecord.place;

  const address = doc.road_address_name || doc.address_name;
  const region = address ? await findRegionByAddress(address) : null;

  const placeData = {
    name: doc.place_name,
    normalizedName: normalizePlaceName(doc.place_name),
    categorySummary: doc.category_name || null,
    roadAddress: doc.road_address_name || null,
    jibunAddress: doc.address_name || null,
    latitude: Number(doc.y),
    longitude: Number(doc.x),
    phone: doc.phone || null,
    websiteUrl: doc.place_url || null,
    regionId: region?.id,
  };

  const place = existingRecord
    ? await prisma.place.update({ where: { id: existingRecord.place.id }, data: placeData })
    : await prisma.place.create({ data: placeData });

  const payloadHash = crypto.createHash("sha256").update(JSON.stringify(doc)).digest("hex");
  await prisma.placeSourceRecord.upsert({
    where: { sourceId_externalPlaceKey: { sourceId, externalPlaceKey: doc.id } },
    update: { payloadHash, rawPayloadJson: doc, expiresAt: new Date(Date.now() + PLACE_TTL_MS) },
    create: {
      placeId: place.id,
      sourceId,
      externalPlaceKey: doc.id,
      payloadHash,
      rawPayloadJson: doc,
      expiresAt: new Date(Date.now() + PLACE_TTL_MS),
    },
  });

  return place;
}

// 네이버 지역 검색을 항상 실시간으로 호출하고(검색 결과 자체는 캐시하지 않음),
// 결과로 나온 개별 장소는 place_source_records.expiresAt 기준 cache-aside로 places에 upsert한다.
export async function searchAndCachePlaces(query: string): Promise<CachedPlace[]> {
  const documents = await fetchPlaces(query);
  const source = await getOrCreateDataSource("PLACE_SEARCH", "장소 검색 API (Naver Local)", "search_api");

  const results: CachedPlace[] = [];
  for (const doc of documents) {
    results.push(toCachedPlace(await upsertPlaceFromDoc(doc, source.id)));
  }
  return results;
}

// LLM이 이름만 준 장소를 실제 좌표 있는 Place로 매칭한다(예: 추천 결과를 places/
// route_places에 저장하려 할 때). 완벽한 매칭은 보장 못 하지만, 동명이인 장소로
// 잘못 연결될 위험을 아래 두 가지로 낮춘다:
//   1. 검색어에 지역명을 같이 붙여서(예: "대구 대구미술관") 네이버 자체 관련도
//      랭킹이 그 지역 결과를 우선하게 만든다 — 단순 "대구미술관" 검색보다 정확.
//   2. pickBestPlaceMatch로 이름이 정확히 일치하는 결과를 최우선으로 고른다.
// 그래도 못 찾으면(검색 결과 0건) null — 호출부가 그 장소는 DB 연결 없이 건너뛴다.
export async function resolvePlaceByName(name: string, regionName?: string | null): Promise<Place | null> {
  const query = regionName ? `${regionName} ${name}` : name;
  const documents = await fetchPlaces(query);
  if (documents.length === 0) return null;

  const best = pickBestPlaceMatch(name, documents);
  if (!best) return null;

  const source = await getOrCreateDataSource("PLACE_SEARCH", "장소 검색 API (Naver Local)", "search_api");
  return upsertPlaceFromDoc(best, source.id);
}
