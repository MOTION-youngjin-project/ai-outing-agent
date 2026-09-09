import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getOrCreateDataSource } from "./shared";
import { pickBestPlaceMatch, pickRegionForAddress } from "./matching";
import { fetchPlaceImage } from "@/lib/tools/tourApi";
import { DAEGU_DISTRICTS } from "@/lib/tools/parking";
import type { Place } from "../../../generated/prisma/client";

// 카카오 로컬 - 키워드로 장소 검색
// https://developers.kakao.com/docs/latest/ko/local/dev-guide#search-by-keyword
const KAKAO_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";

type KakaoDocument = {
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

async function fetchOnce(query: string, apiKey: string): Promise<KakaoDocument[]> {
  const params = new URLSearchParams({ query, size: "10" });
  const res = await fetch(`${KAKAO_URL}?${params}`, {
    headers: { Authorization: `KakaoAK ${apiKey}` },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`카카오 로컬 API 오류(${res.status}): ${body}`);
  }

  const data = await res.json();
  return data?.documents ?? [];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ponytail: 다른 공공데이터 API들과 동일하게 최대 3회 재시도.
async function fetchPlaces(query: string): Promise<KakaoDocument[]> {
  const apiKey = process.env.KAKAO_API_KEY;
  if (!apiKey) throw new Error("KAKAO_API_KEY가 설정되지 않았습니다.");

  const MAX_ATTEMPTS = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchOnce(query, apiKey);
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
  daeguDistrict: (typeof DAEGU_DISTRICTS)[number] | null;
}

// 장소 검색(카카오) 결과에도 주차 정보 조회가 되도록, 추천 결과와 같은 방식으로
// 대구광역시 구/군 소속 여부를 region 부모 체인으로 판단한다(LLM이 채워주는
// agent.ts의 daeguDistrict와 달리 여긴 이미 저장된 region 매칭 결과를 그대로 씀).
async function resolveDaeguDistrict(
  regionId: bigint | null | undefined
): Promise<(typeof DAEGU_DISTRICTS)[number] | null> {
  if (!regionId) return null;
  const region = await prisma.region.findUnique({ where: { id: regionId }, include: { parent: true } });
  if (!region || region.level !== "구군" || region.parent?.name !== "대구광역시") return null;
  return DAEGU_DISTRICTS.find((d) => d === region.name) ?? null;
}

async function toCachedPlace(place: Place): Promise<CachedPlace> {
  return {
    id: place.publicId,
    name: place.name,
    roadAddress: place.roadAddress,
    latitude: place.latitude.toNumber(),
    longitude: place.longitude.toNumber(),
    categorySummary: place.categorySummary,
    phone: place.phone,
    websiteUrl: place.websiteUrl,
    daeguDistrict: await resolveDaeguDistrict(place.regionId),
  };
}

export async function getCachedPlaceById(publicId: string): Promise<CachedPlace | null> {
  const place = await prisma.place.findUnique({ where: { publicId } });
  return place ? toCachedPlace(place) : null;
}

async function findRegionByAddress(address: string) {
  const regions = await prisma.region.findMany({ where: { level: { in: ["시도", "구군"] } } });
  return pickRegionForAddress(address, regions);
}

// 카카오 문서 하나를 places/place_source_records에 cache-aside로 upsert하고 Place 행을 반환한다.
async function upsertPlaceFromDoc(doc: KakaoDocument, sourceId: bigint): Promise<Place> {
  const existingRecord = await prisma.placeSourceRecord.findUnique({
    where: { sourceId_externalPlaceKey: { sourceId, externalPlaceKey: doc.id } },
    include: { place: true },
  });

  const isFresh = existingRecord?.expiresAt ? existingRecord.expiresAt > new Date() : false;
  if (existingRecord && isFresh) {
    // Kakao 캐시는 신선해도 이미지는 이 기능이 생기기 전부터 있던 장소라 아직 없을 수
    // 있다 — ensurePlaceImage 자체가 이미 있으면 즉시 반환이라 여기서 매번 불러도 싸다.
    await ensurePlaceImage(existingRecord.place, null);
    return existingRecord.place;
  }

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

  await ensurePlaceImage(place, region?.name ?? null);

  return place;
}

// 이미지는 한 번 캐시되면 다시 안 가져온다 — TourAPI 무료 쿼터가 하루 1,000건뿐이고
// 장소 사진은 자주 안 바뀌어서, place_source_records처럼 TTL로 매번 갱신할 이유가 없다.
// 실패해도(TourAPI 오류, 검색 결과 없음) 장소 자체는 그대로 살린다 — 사진은 있으면
// 화면에 보여주고 없으면 아이콘 placeholder로 대체되는 부가 기능일 뿐이다.
async function ensurePlaceImage(place: Place, regionName: string | null): Promise<void> {
  const existing = await prisma.placeImage.findFirst({ where: { placeId: place.id } });
  if (existing) return;

  try {
    const image = await fetchPlaceImage(place.name, regionName);
    if (!image) return;
    await prisma.placeImage.create({
      data: {
        placeId: place.id,
        originalUrl: image.originalUrl,
        thumbnailUrl: image.thumbnailUrl,
        isPrimary: true,
      },
    });
  } catch (err) {
    console.error(`장소 이미지 조회 실패(${place.name}):`, err);
  }
}

// 카카오 로컬 검색을 항상 실시간으로 호출하고(검색 결과 자체는 캐시하지 않음),
// 결과로 나온 개별 장소는 place_source_records.expiresAt 기준 cache-aside로 places에 upsert한다.
export async function searchAndCachePlaces(query: string): Promise<CachedPlace[]> {
  const documents = await fetchPlaces(query);
  const source = await getOrCreateDataSource("PLACE_SEARCH", "장소 검색 API (Kakao Local)", "search_api");

  const results: CachedPlace[] = [];
  for (const doc of documents) {
    results.push(await toCachedPlace(await upsertPlaceFromDoc(doc, source.id)));
  }
  return results;
}

// LLM이 이름만 준 장소를 실제 좌표 있는 Place로 매칭한다(예: 추천 결과를 places/
// route_places에 저장하려 할 때). 완벽한 매칭은 보장 못 하지만, 동명이인 장소로
// 잘못 연결될 위험을 아래 두 가지로 낮춘다:
//   1. 검색어에 지역명을 같이 붙여서(예: "대구 대구미술관") 카카오 자체 관련도
//      랭킹이 그 지역 결과를 우선하게 만든다 — 단순 "대구미술관" 검색보다 정확.
//   2. pickBestPlaceMatch로 이름이 정확히 일치하는 결과를 최우선으로 고른다.
// 그래도 못 찾으면(검색 결과 0건) null — 호출부가 그 장소는 DB 연결 없이 건너뛴다.
export async function resolvePlaceByName(name: string, regionName?: string | null): Promise<Place | null> {
  const query = regionName ? `${regionName} ${name}` : name;
  const documents = await fetchPlaces(query);
  if (documents.length === 0) return null;

  const best = pickBestPlaceMatch(name, documents);
  if (!best) return null;

  const source = await getOrCreateDataSource("PLACE_SEARCH", "장소 검색 API (Kakao Local)", "search_api");
  return upsertPlaceFromDoc(best, source.id);
}
