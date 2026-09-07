// 전국 17개 시/도 공용 목록 — 대기질/날씨 등 지역 기반 도구가 공유한다.
export const SIDO_NAMES = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

// 도(道) 정식 명칭은 축약형을 부분 문자열로 포함하지 않는다 (예: "충청북도".includes("충북") === false).
const SIDO_ALIASES: Record<string, string> = {
  충청북도: "충북",
  충청남도: "충남",
  전라북도: "전북",
  전라남도: "전남",
  경상북도: "경북",
  경상남도: "경남",
};

export function normalizeSido(region: string): string | null {
  const alias = Object.entries(SIDO_ALIASES).find(([full]) => region.includes(full));
  if (alias) return alias[1];
  return SIDO_NAMES.find((sido) => region.includes(sido)) ?? null;
}

// 시/도청 소재지 대표 좌표(위도, 경도) — 기상청 격자 변환 입력용.
export const SIDO_LATLON: Record<string, { lat: number; lon: number }> = {
  서울: { lat: 37.5665, lon: 126.978 },
  부산: { lat: 35.1796, lon: 129.0756 },
  대구: { lat: 35.8714, lon: 128.6014 },
  인천: { lat: 37.4563, lon: 126.7052 },
  광주: { lat: 35.1595, lon: 126.8526 },
  대전: { lat: 36.3504, lon: 127.3845 },
  울산: { lat: 35.5384, lon: 129.3114 },
  세종: { lat: 36.48, lon: 127.289 },
  경기: { lat: 37.2636, lon: 127.0286 }, // 수원
  강원: { lat: 37.8813, lon: 127.7298 }, // 춘천
  충북: { lat: 36.6357, lon: 127.4913 }, // 청주
  충남: { lat: 36.6588, lon: 126.6669 }, // 홍성
  전북: { lat: 35.8242, lon: 127.148 }, // 전주
  전남: { lat: 34.8161, lon: 126.4629 }, // 무안
  경북: { lat: 36.576, lon: 128.5056 }, // 안동
  경남: { lat: 35.2281, lon: 128.6811 }, // 창원
  제주: { lat: 33.4996, lon: 126.5312 },
};

// 기상청 단기예보 격자 변환 (위경도 -> nx, ny), Lambert Conformal Conic 투영.
// 상수·공식 출처: 기상청 공식 예제(RE=6371.00877, GRID=5.0, SLAT1=30, SLAT2=60, OLON=126, OLAT=38, XO=43, YO=136).
export function latLonToGrid(lat: number, lon: number): { nx: number; ny: number } {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
  const DEGRAD = Math.PI / 180.0;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (sf ** sn) * Math.cos(slat1) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / (ro ** sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / (ra ** sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;

  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
  return { nx, ny };
}
