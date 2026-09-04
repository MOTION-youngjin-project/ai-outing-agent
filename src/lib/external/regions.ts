const REGION_ALIASES: Record<string, string> = {
  서울특별시: "서울",
  부산광역시: "부산",
  대구광역시: "대구",
  인천광역시: "인천",
  광주광역시: "광주",
  대전광역시: "대전",
  울산광역시: "울산",
  세종특별자치시: "세종",
  경기도: "경기",
  강원특별자치도: "강원",
  충청북도: "충북",
  충청남도: "충남",
  전북특별자치도: "전북",
  전라북도: "전북",
  전라남도: "전남",
  경상북도: "경북",
  경상남도: "경남",
  제주특별자치도: "제주",
};

export const REGION_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  서울: { latitude: 37.5665, longitude: 126.978 },
  부산: { latitude: 35.1796, longitude: 129.0756 },
  대구: { latitude: 35.8714, longitude: 128.6014 },
  인천: { latitude: 37.4563, longitude: 126.7052 },
  광주: { latitude: 35.1595, longitude: 126.8526 },
  대전: { latitude: 36.3504, longitude: 127.3845 },
  울산: { latitude: 35.5384, longitude: 129.3114 },
  세종: { latitude: 36.48, longitude: 127.289 },
  경기: { latitude: 37.2636, longitude: 127.0286 },
  강원: { latitude: 37.8813, longitude: 127.7298 },
  충북: { latitude: 36.6357, longitude: 127.4913 },
  충남: { latitude: 36.6588, longitude: 126.6669 },
  전북: { latitude: 35.8242, longitude: 127.148 },
  전남: { latitude: 34.8161, longitude: 126.4629 },
  경북: { latitude: 36.576, longitude: 128.5056 },
  경남: { latitude: 35.2281, longitude: 128.6811 },
  제주: { latitude: 33.4996, longitude: 126.5312 },
};

export function normalizeRegion(value: string): string | null {
  const trimmed = value.trim();
  if (REGION_ALIASES[trimmed]) return REGION_ALIASES[trimmed];
  return Object.keys(REGION_COORDINATES).find((name) => trimmed.includes(name)) ?? null;
}

export function latitudeLongitudeToGrid(latitude: number, longitude: number) {
  const earthRadius = 6371.00877;
  const gridSpacing = 5;
  const standardLatitude1 = 30 * (Math.PI / 180);
  const standardLatitude2 = 60 * (Math.PI / 180);
  const referenceLongitude = 126 * (Math.PI / 180);
  const referenceLatitude = 38 * (Math.PI / 180);
  const originX = 43;
  const originY = 136;
  const scaledRadius = earthRadius / gridSpacing;

  let cone = Math.tan(Math.PI / 4 + standardLatitude2 / 2) / Math.tan(Math.PI / 4 + standardLatitude1 / 2);
  cone = Math.log(Math.cos(standardLatitude1) / Math.cos(standardLatitude2)) / Math.log(cone);
  let scale = Math.tan(Math.PI / 4 + standardLatitude1 / 2);
  scale = (scale ** cone * Math.cos(standardLatitude1)) / cone;
  let referenceRadius = Math.tan(Math.PI / 4 + referenceLatitude / 2);
  referenceRadius = (scaledRadius * scale) / referenceRadius ** cone;
  let radius = Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360);
  radius = (scaledRadius * scale) / radius ** cone;
  let theta = (longitude * Math.PI) / 180 - referenceLongitude;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= cone;

  return {
    nx: Math.floor(radius * Math.sin(theta) + originX + 0.5),
    ny: Math.floor(referenceRadius - radius * Math.cos(theta) + originY + 0.5),
  };
}
