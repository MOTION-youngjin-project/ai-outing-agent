// 우리 자신의 /api/* 라우트를 호출하는 클라이언트 쪽 fetch 함수 모음. 화면(screens/)
// 여러 곳에서 같은 엔드포인트를 쓰기도 해서(예: 지역/날씨/대기질) 한 곳에 모아 재사용한다.
import type { ChatTurn, Recommendation } from "@/lib/agent";
import type { ParkingSpot } from "@/lib/tools/parking";

export type Region = { id: string; parentId: string | null; name: string; level: string };
export type ParkingSpotWithDistance = ParkingSpot & { distanceMeters: number | null; walkMinutes: number | null };
export type ParkingResult = { spots: ParkingSpotWithDistance[]; destination: { latitude: number; longitude: number } | null };
export type WeatherInfo = { temperatureC: number | null; precipitationProbability: number | null; summary: string };
export type AirQualityInfo = { pm10Value: number | null; overallGrade: string };
export type PlaceResult = {
  id: string;
  name: string;
  roadAddress: string | null;
  categorySummary: string | null;
  phone: string | null;
};
export type CulturalEvent = { title: string; eventPeriod: string; eventSite: string; url: string; imageUrl: string };
export type SavedPlaceResult = {
  placeId: string;
  name: string;
  categorySummary: string | null;
  roadAddress: string | null;
  imageUrl: string | null;
};
export type RecentQuestion = { id: string; question: string; askedAt: string };

export async function fetchRegions(): Promise<Region[]> {
  const res = await fetch("/api/regions?level=sido");
  const data = await res.json();
  return data.data ?? [];
}

export async function fetchWeather(regionId: string): Promise<WeatherInfo | null> {
  const res = await fetch(`/api/weather?regionId=${regionId}`);
  const data = await res.json();
  return data.data ?? null;
}

export async function fetchAirQuality(regionId: string): Promise<AirQualityInfo | null> {
  const res = await fetch(`/api/air-quality?regionId=${regionId}`);
  const data = await res.json();
  return data.data ?? null;
}

export async function fetchParking(district: string, placeName?: string): Promise<ParkingResult> {
  try {
    const params = new URLSearchParams({ district });
    if (placeName) params.set("placeName", placeName);
    const res = await fetch(`/api/parking?${params}`);
    const data = await res.json();
    return res.ok ? { spots: data.spots, destination: data.destination } : { spots: [], destination: null };
  } catch {
    return { spots: [], destination: null };
  }
}

export async function fetchPlacesSearch(query: string): Promise<PlaceResult[]> {
  const res = await fetch(`/api/places?query=${encodeURIComponent(query)}`);
  const data = await res.json();
  return res.ok ? data.data : [];
}

export async function fetchCulturalEvents(params: { dtype: string; keyword: string }): Promise<CulturalEvent[]> {
  const search = new URLSearchParams({ dtype: params.dtype });
  if (params.keyword) search.set("keyword", params.keyword);
  const res = await fetch(`/api/cultural-events?${search}`);
  const data = await res.json();
  return res.ok ? data.data : [];
}

export async function fetchSavedPlaces(): Promise<SavedPlaceResult[]> {
  const res = await fetch("/api/saved-places");
  if (!res.ok) return [];
  const data = await res.json();
  return data.data ?? [];
}

export async function fetchPreferences(): Promise<string[]> {
  const res = await fetch("/api/preferences");
  if (!res.ok) return [];
  const data = await res.json();
  return data.tags ?? [];
}

export async function putPreferences(tags: string[]): Promise<void> {
  await fetch("/api/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags }),
  });
}

export async function fetchRecentQuestions(): Promise<RecentQuestion[]> {
  const res = await fetch("/api/recent-questions");
  if (!res.ok) return [];
  const data = await res.json();
  return data.data ?? [];
}

export type PlaceWithMeta = NonNullable<Recommendation["places"]>[number] & {
  category?: string | null;
  distanceKm?: number | null;
  placeId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};
export type RecommendResult = Omit<Recommendation, "places"> & { places?: PlaceWithMeta[] };
export type RecommendProgressEvent = { type: string; tool?: string };

// 거리(km) 배지 계산용 GPS 좌표. 권한 거부/미지원/타임아웃이면 조용히 null —
// 배지가 안 뜰 뿐 추천 자체를 막을 이유는 아니다.
function getCurrentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000 }
    );
  });
}

// /api/recommend는 NDJSON(줄바꿈 구분 JSON)을 스트리밍한다 — 도구 호출 시작/종료,
// 장소 정리 단계를 onProgress로 실시간 전달하고, "result"/"error" 줄로 끝난다.
export async function postRecommend(
  history: ChatTurn[],
  onProgress?: (event: RecommendProgressEvent) => void
): Promise<RecommendResult> {
  const origin = await getCurrentPosition();

  let res: Response;
  try {
    res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history, origin }),
    });
  } catch {
    throw new Error("요청에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
  if (!res.ok || !res.body) throw new Error("알 수 없는 오류가 발생했습니다.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: RecommendResult | null = null;
  let errorMessage: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "result") result = event.result.recommendation as RecommendResult;
      else if (event.type === "error") errorMessage = event.message;
      else onProgress?.(event);
    }
  }

  if (errorMessage) throw new Error(errorMessage);
  if (!result) throw new Error("알 수 없는 오류가 발생했습니다.");
  return result;
}

export async function postSuggest(history: ChatTurn[]): Promise<string | null> {
  const res = await fetch("/api/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ history }),
  });
  const data = await res.json();
  return data.suggestion ?? null;
}
