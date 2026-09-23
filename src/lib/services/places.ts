import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getOrCreateDataSource } from "./shared";
import { pickBestPlaceMatch, pickConfidentPlaceMatch, pickRegionForAddress, rankPlaceMatches, type PlaceMatchHint } from "./matching";
import { fetchPlaceImage } from "@/lib/tools/tourApi";
import { fetchWikipediaImage } from "@/lib/tools/wikipedia";
import { DAEGU_DISTRICTS } from "@/lib/tools/parking";
import type { Place } from "../../../generated/prisma/client";
import { coordinate } from "../coordinates";
import { normalizeSido } from "../region";
import { withRetry } from "../withRetry";

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

export type PlaceMatchCandidate = {
  externalId: string;
  name: string;
  address: string;
  category: string | null;
  latitude: number;
  longitude: number;
  mapUrl: string;
  score: number;
  distanceM: number | null;
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
  if (!Array.isArray(data?.documents)) throw new Error("장소 검색 응답 형식 오류");
  return data.documents.filter((d: KakaoDocument) => d?.id && typeof d.place_name === "string" && coordinate(d.y, d.x));
}

// ponytail: 다른 공공데이터 API들과 동일하게 최대 3회 재시도.
async function fetchPlaces(query: string): Promise<KakaoDocument[]> {
  const apiKey = process.env.KAKAO_API_KEY;
  if (!apiKey) throw new Error("KAKAO_API_KEY가 설정되지 않았습니다.");

  return withRetry(() => fetchOnce(query, apiKey), 3);
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
  imageUrl: string | null;
}

// ensurePlaceImage가 채워둔 대표 이미지를 꺼내온다 — saved-places/route.ts가 이미 쓰던
// thumbnailUrl 우선, 없으면 originalUrl 패턴을 여기로 모아서 다른 호출부도 같이 쓴다.
export async function getPlaceImageUrl(placeId: bigint): Promise<string | null> {
  // orderBy 없이 findFirst만 쓰면 저장 순서가 우연히 대표(isPrimary)가 아닌 이미지를
  // 앞세울 수 있다 — sortOrder(0이 대표)로 명시해서 항상 대표 이미지를 돌려준다.
  const image = await prisma.placeImage.findFirst({ where: { placeId }, orderBy: { sortOrder: "asc" } });
  return image?.thumbnailUrl ?? image?.originalUrl ?? null;
}

// 대구광역시 구/군 소속 여부를 region 부모 체인(= 카카오 주소 매칭 결과)으로 판단한다.
// LLM이 채워주는 agent.ts의 daeguDistrict는 자주 비거나 틀리므로, 장소 검색이든 추천이든
// 실제 Place를 찾은 뒤에는 항상 이 함수 결과를 정답으로 쓴다.
export async function resolveDaeguDistrict(
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
    imageUrl: await getPlaceImageUrl(place.id),
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
    // 위키백과에 문서가 있는 유명한 곳이면(대구미술관 등) 그 대표 사진을 우선 쓴다 —
    // 사람이 큐레이션한 사진이라 TourAPI 갤러리보다 신뢰도가 높다. 없으면 기존 로직.
    const image = (await fetchWikipediaImage(place.name)) ?? (await fetchPlaceImage(place.name, regionName));
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
export async function resolvePlaceByName(name: string, regionName?: string | null, hint: PlaceMatchHint = {}): Promise<Place | null> {
  const query = regionName ? `${regionName} ${name}` : name;
  // fetchPlaces 자체가 이미 3회 재시도한다 — 여기서 실패를 삼키면 API 장애 때마다
  // recoverPlaceMatch의 최대 4개 쿼리(각 3회 재시도, 총 12회)로 또 넘어가 장애를
  // 증폭시킨다. 검색 자체가 실패한 경우와 "검색은 됐지만 못 찾음"을 구분해서,
  // 전자는 바로 포기한다.
  let documents: KakaoDocument[];
  try {
    documents = await fetchPlaces(query);
  } catch (err) {
    console.error(`장소 검색 실패(${name}):`, err);
    return null;
  }
  const candidates = regionName ? documents.filter(d => {
    const address = `${d.road_address_name} ${d.address_name}`;
    const sido = normalizeSido(regionName);
    return sido ? normalizeSido(address) === sido : address.includes(regionName);
  }) : documents;
  const best = pickBestPlaceMatch(name, candidates);
  if (!best) return (await recoverPlaceMatch(name, regionName, hint)).place;

  const source = await getOrCreateDataSource("PLACE_SEARCH", "장소 검색 API (Kakao Local)", "search_api");
  return upsertPlaceFromDoc(best, source.id);
}

function uniqueDocuments(groups: KakaoDocument[][]): KakaoDocument[] {
  return [...new Map(groups.flat().map(document => [document.id, document])).values()];
}

function inRequestedRegion(document: KakaoDocument, regionName?: string | null) {
  if (!regionName) return true;
  const address = `${document.road_address_name} ${document.address_name}`;
  const sido = normalizeSido(regionName);
  return sido ? normalizeSido(address) === sido : address.includes(regionName);
}

export async function findPlaceMatchCandidates(
  name: string,
  regionName?: string | null,
  hint: PlaceMatchHint = {},
): Promise<{ documents: KakaoDocument[]; candidates: PlaceMatchCandidate[] }> {
  const queries = [
    [regionName, name].filter(Boolean).join(" "),
    [name, regionName, hint.district].filter(Boolean).join(" "),
    [name, hint.district].filter(Boolean).join(" "),
    name,
  ].filter((query, index, all) => query && all.indexOf(query) === index);
  const settled = await Promise.allSettled(queries.map(query => fetchPlaces(query)));
  const successful = settled.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
  if (successful.length === 0) throw new Error("카카오 장소 검색에 실패했습니다.");
  const documents = uniqueDocuments(successful).filter(document => inRequestedRegion(document, regionName));
  const ranked = rankPlaceMatches(name, documents, hint).filter(item => item.score >= 20).slice(0, 5);
  return {
    documents,
    candidates: ranked.map(({ document, score, distanceM }) => ({
      externalId: document.id,
      name: document.place_name,
      address: document.road_address_name || document.address_name,
      category: document.category_name || null,
      latitude: Number(document.y), longitude: Number(document.x),
      mapUrl: document.place_url, score, distanceM,
    })),
  };
}

export async function recoverPlaceMatch(
  name: string,
  regionName?: string | null,
  hint: PlaceMatchHint = {},
  selectedExternalId?: string,
): Promise<{ place: Place | null; candidates: PlaceMatchCandidate[] }> {
  const result = await findPlaceMatchCandidates(name, regionName, hint);
  // 주소나 기준 좌표 같은 실제 corroboration 없이 이름 유사도만으로는 자동으로
  // 고르지 않는다 — district(지역) 필터만으로는 동명이인/동일 상호 지점을
  // 구분 못 해서, 힌트 없는 호출(예: 주차장 검색의 장소명 매칭)에서 엉뚱한
  // 좌표를 조용히 골라버릴 수 있다. 이 경우는 후보만 돌려주고 자동 선택은 안 한다.
  const canAutoPick = !!hint.address || !!hint.reference;
  const selected = selectedExternalId
    ? result.documents.find(document => document.id === selectedExternalId)
    : canAutoPick ? pickConfidentPlaceMatch(name, result.documents, hint) : undefined;
  if (!selected) return { place: null, candidates: result.candidates };
  const source = await getOrCreateDataSource("PLACE_SEARCH", "장소 검색 API (Kakao Local)", "search_api");
  return { place: await upsertPlaceFromDoc(selected, source.id), candidates: result.candidates };
}

// 사용자가 findPlaceMatchCandidates가 앞서 돌려준 후보 하나를 화면에서 직접 고른
// 경우 쓴다. selectedExternalId만 받아 recoverPlaceMatch로 카카오를 다시 검색하면,
// 그 사이 카카오 결과 순서/구성이 바뀌어 방금 고른 id를 새 결과에서 못 찾을 수
// 있다 — 사용자의 선택이 조용히 무시되고 엉뚱한 새 후보 목록으로 바뀌는 문제였다.
// 후보 자체가 매칭에 필요한 정보(이름/주소/좌표 등)를 이미 담고 있으므로, 그걸
// 그대로 써서 재검색 없이 확정한다.
export async function resolveSelectedCandidate(candidate: PlaceMatchCandidate): Promise<Place> {
  const doc: KakaoDocument = {
    id: candidate.externalId,
    place_name: candidate.name,
    category_name: candidate.category ?? "",
    road_address_name: candidate.address,
    address_name: candidate.address,
    phone: "",
    place_url: candidate.mapUrl,
    x: String(candidate.longitude),
    y: String(candidate.latitude),
  };
  const source = await getOrCreateDataSource("PLACE_SEARCH", "장소 검색 API (Kakao Local)", "search_api");
  return upsertPlaceFromDoc(doc, source.id);
}
