// 한국관광공사_국문 관광정보 서비스_GW(TourAPI, KorService2) - 키워드로 장소를 검색해서
// 대표 이미지 URL을 가져온다. 무료로 실제 장소 사진 필드를 제공하는 유일한 API로 확인됨
// (docs/research/place-images-data-sources.md, 2026-09-08 실호출 검증 완료).
// 주의: "대표이미지"로 지정된 사진이 화장실 안내 사진처럼 부적절한 경우가 실제로 있었음
// (같은 조사에서 확인) — 사진이 있다고 항상 그 장소를 잘 보여준다는 보장은 없다.
import { tourismRegionParams } from "@/lib/external/tour-api-cache";

const TOUR_API_URL = "https://apis.data.go.kr/B551011/KorService2/searchKeyword2";

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ponytail: 다른 공공데이터 API들과 동일하게 최대 3회 재시도.
async function fetchWithRetry(query: string): Promise<TourApiItem[]> {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) throw new Error("DATA_GO_KR_API_KEY가 설정되지 않았습니다.");

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

// 장소 대표 이미지를 찾아온다. 못 찾으면(검색 결과 없음/이미지 필드 없음) null —
// 호출부가 이미지 없이 그대로 진행한다(아이콘 placeholder 유지).
export async function fetchPlaceImage(name: string, regionName?: string | null): Promise<PlaceImageResult | null> {
  // 2026-09-13 실측: 검색어 앞에 지역명을 붙이면("중구 달성공원") TourAPI 키워드 검색이
  // 0건이 된다 — 제목 매칭이라 지역명이 끼면 안 맞는다. 그래서 사진이 거의 안 붙었다.
  // 이름만으로 검색하고, 지역 한정은 lDongRegnCd로 한다(regionName은 결과를 고를 때만 쓴다).
  const items = await fetchWithRetry(name);
  const item = items.find((i) => i.firstimage && (!regionName || (i.addr1 ?? "").includes(regionName))) ??
    items.find((i) => i.firstimage);
  if (!item?.firstimage) return null;

  return { originalUrl: item.firstimage, thumbnailUrl: item.firstimage2 || null };
}
