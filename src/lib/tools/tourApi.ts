// 한국관광공사_국문 관광정보 서비스_GW(TourAPI, KorService2) - 키워드로 장소를 검색해서
// 대표 이미지 URL을 가져온다. 무료로 실제 장소 사진 필드를 제공하는 유일한 API로 확인됨
// (docs/research/place-images-data-sources.md, 2026-09-08 실호출 검증 완료).
// searchKeyword2의 "대표이미지"(firstimage)는 화장실 안내 사진처럼 부적절한 경우가 실제로
// 있었음(같은 조사, 2026-09-08 대구미술관 사례) — 그래서 firstimage 대신 detailImage2
// 갤러리의 1번 사진을 우선 쓴다(2026-09-14). 메타데이터로 부적절한 사진을 가려낼 방법이
// 없다는 게 이미 결론 났으니(docs/research/place-image-quality-filtering.md) 완전한 보장은
// 아니지만, 별도로 "대표"라고 큐레이션되는 firstimage보다는 순서대로 매겨진 갤러리 사진이
// 더 안정적이었다(같은 사례로 실측). 갤러리가 비어 있으면 firstimage로 폴백한다.
import { tourismRegionParams } from "@/lib/external/tour-api-cache";
import { withRetry } from "../withRetry.ts";

const TOUR_API_URL = "https://apis.data.go.kr/B551011/KorService2/searchKeyword2";
const DETAIL_IMAGE_URL = "https://apis.data.go.kr/B551011/KorService2/detailImage2";

type TourApiItem = {
  contentid: string;
  firstimage?: string;
  firstimage2?: string;
  addr1?: string;
};

export type PlaceImageResult = { originalUrl: string; thumbnailUrl: string | null };

// data.go.kr이 발급하는 "인증키(Encoding)"는 이미 URL 인코딩된 값이라, URLSearchParams로
// 다시 인코딩하면 이중 인코딩되어 인증 실패한다(airQuality.ts/weather.ts와 동일한 이유로
// serviceKey는 쿼리스트링에 직접 붙인다).
async function fetchOnce(query: string, apiKey: string): Promise<TourApiItem[]> {
  const params = new URLSearchParams({
    MobileOS: "ETC",
    MobileApp: "AiOutingAgent",
    _type: "json",
    keyword: query,
    numOfRows: "5",
    // 지역 한정은 검색어가 아니라 이 파라미터로 해야 한다 — searchKeyword2는 areaCode를
    // 안 쓰고 lDongRegnCd(27=대구)를 쓴다(tour-api-cache.ts의 tourismRegionParams 주석 참고).
    ...tourismRegionParams("searchKeyword2"),
  });

  const res = await fetch(`${TOUR_API_URL}?serviceKey=${apiKey}&${params}`, {
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json();

  const errMsg = data?.OpenAPI_ServiceResponse?.cmmMsgHeader?.errMsg;
  if (errMsg) throw new Error(`TourAPI 서비스 오류: ${errMsg}`);

  const header = data?.response?.header;
  if (header?.resultCode !== "0000") {
    throw new Error(`TourAPI 오류: ${header?.resultMsg ?? "알 수 없는 오류"}`);
  }

  const item = data?.response?.body?.items?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

// ponytail: 다른 공공데이터 API들과 동일하게 최대 3회 재시도.
async function fetchWithRetry(query: string): Promise<TourApiItem[]> {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) throw new Error("DATA_GO_KR_API_KEY가 설정되지 않았습니다.");

  return withRetry(() => fetchOnce(query, apiKey), 3);
}

async function fetchGalleryFirst(contentId: string, apiKey: string): Promise<PlaceImageResult | null> {
  const params = new URLSearchParams({
    MobileOS: "ETC", MobileApp: "AiOutingAgent", _type: "json",
    contentId, imageYN: "Y", numOfRows: "1", pageNo: "1",
  });
  const res = await fetch(`${DETAIL_IMAGE_URL}?serviceKey=${apiKey}&${params}`, {
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json();
  if (data?.response?.header?.resultCode !== "0000") return null;

  const item = data?.response?.body?.items?.item;
  const first = Array.isArray(item) ? item[0] : item;
  if (!first?.originimgurl) return null;

  return { originalUrl: first.originimgurl, thumbnailUrl: first.smallimageurl || null };
}

// 장소 대표 이미지를 찾아온다. 못 찾으면(검색 결과 없음/갤러리·firstimage 둘 다 없음) null —
// 호출부가 이미지 없이 그대로 진행한다(아이콘 placeholder 유지).
export async function fetchPlaceImage(name: string, regionName?: string | null): Promise<PlaceImageResult | null> {
  // 2026-09-13 실측: 검색어 앞에 지역명을 붙이면("중구 달성공원") TourAPI 키워드 검색이
  // 0건이 된다 — 제목 매칭이라 지역명이 끼면 안 맞는다. 그래서 사진이 거의 안 붙었다.
  // 이름만으로 검색하고, 지역 한정은 lDongRegnCd로 한다(regionName은 결과를 고를 때만 쓴다).
  const items = await fetchWithRetry(name);
  const item = items.find((i) => !regionName || (i.addr1 ?? "").includes(regionName)) ?? items[0];
  if (!item) return null;

  const apiKey = process.env.DATA_GO_KR_API_KEY!;
  const gallery = await fetchGalleryFirst(item.contentid, apiKey).catch(() => null);
  if (gallery) return gallery;

  return item.firstimage ? { originalUrl: item.firstimage, thumbnailUrl: item.firstimage2 || null } : null;
}
