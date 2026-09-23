// 우리 자신의 /api/* 라우트를 호출하는 클라이언트 쪽 fetch 함수 모음. 화면(screens/)
// 여러 곳에서 같은 엔드포인트를 쓰기도 해서(예: 지역/날씨/대기질) 한 곳에 모아 재사용한다.
import type { ChatTurn, Recommendation } from "@/lib/agent";
import type { ParkingSpot } from "@/lib/tools/parking";
import type { TransitItinerary } from "@/lib/services/transit";

export type Region = { id: string; parentId: string | null; name: string; level: string };
export type ParkingSpotWithDistance = ParkingSpot & { distanceMeters: number | null; walkMinutes: number | null };
export type ParkingResult = { spots: ParkingSpotWithDistance[]; destination: { latitude: number; longitude: number } | null };
export type WeatherInfo = { temperatureC: number | null; precipitationProbability: number | null; summary: string; hourly: { forecastAt: string; temperatureC: number | null; precipitationProbability: number | null; summary: string }[] };
export type AirQualityInfo = { pm10Value: number | null; overallGrade: string };
export type PlaceResult = {
  id: string;
  name: string;
  roadAddress: string | null;
  categorySummary: string | null;
  phone: string | null;
  daeguDistrict: string | null;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
};
export type CulturalEvent = { title: string; eventPeriod: string; eventSite: string; url: string; imageUrl: string };
export type SavedPlaceResult = {
  placeId: string;
  name: string;
  categorySummary: string | null;
  roadAddress: string | null;
  imageUrl: string | null;
  // "YYYY-MM-DD" 또는 null(방문 예정 아님).
  plannedVisitAt: string | null;
};
export type RecentQuestion = { id: string; question: string; askedAt: string };

// 지금은 대구권 데이터만 있는 앱이라(핸드오프 2026-09-14), 지역 선택지를 대구광역시 +
// 그 구/군으로 좁힌다. 다른 지역 데이터가 쌓이면 이 필터부터 걷어낼 것.
export async function fetchRegions(): Promise<Region[]> {
  const sidoRes = await fetch("/api/regions?level=sido&search=대구광역시");
  const sidoData = await sidoRes.json();
  const daegu: Region | undefined = sidoData.data?.[0];
  if (!daegu) return sidoData.data ?? [];

  const districtRes = await fetch(`/api/regions?parentId=${daegu.id}`);
  const districtData = await districtRes.json();
  return [daegu, ...(districtData.data ?? [])];
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

export async function fetchTransitDirections(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): Promise<TransitItinerary[]> {
  try {
    const params = new URLSearchParams({
      fromLat: String(from.latitude),
      fromLng: String(from.longitude),
      toLat: String(to.latitude),
      toLng: String(to.longitude),
    });
    const res = await fetch(`/api/transit?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.data ?? [];
  } catch {
    return [];
  }
}

export type DrivingRouteOption = {
  option: string;
  distanceM: number;
  durationMin: number;
  path: { latitude: number; longitude: number }[];
};

export async function fetchDrivingDirections(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): Promise<DrivingRouteOption[]> {
  try {
    const params = new URLSearchParams({
      fromLat: String(from.latitude),
      fromLng: String(from.longitude),
      toLat: String(to.latitude),
      toLng: String(to.longitude),
    });
    const res = await fetch(`/api/directions?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.data ?? [];
  } catch {
    return [];
  }
}

export type WalkingStep = {
  latitude: number;
  longitude: number;
  description: string;
  turnType: number;
  distanceToNextM: number | null;
  timeToNextSec: number | null;
};
export type WalkingRoute = {
  totalDistanceM: number;
  totalTimeSec: number;
  steps: WalkingStep[];
  path: { latitude: number; longitude: number }[];
};

export async function fetchWalkingRoute(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): Promise<WalkingRoute | null> {
  try {
    const params = new URLSearchParams({
      fromLat: String(from.latitude),
      fromLng: String(from.longitude),
      toLat: String(to.latitude),
      toLng: String(to.longitude),
    });
    const res = await fetch(`/api/directions/walking?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.data ?? null;
  } catch {
    return null;
  }
}

export async function fetchParking(district: string, placeName?: string, origin?: { latitude?: number | null; longitude?: number | null }): Promise<ParkingResult> {
    const params = new URLSearchParams({ district });
    if (placeName) params.set("placeName", placeName);
    if (origin?.latitude != null && origin.longitude != null) { params.set("latitude", String(origin.latitude)); params.set("longitude", String(origin.longitude)); }
    const res = await fetch(`/api/parking?${params}`);
    const data = await res.json();
    if (!res.ok || !Array.isArray(data.spots)) throw new Error("주차장 정보를 불러오지 못했습니다.");
    return { spots: data.spots, destination: data.destination };
}

export async function fetchPlacesSearch(query: string): Promise<PlaceResult[]> {
  const res = await fetch(`/api/places?query=${encodeURIComponent(query)}`);
  const data = await res.json();
  return res.ok ? data.data : [];
}

export async function fetchPlace(placeId: string): Promise<PlaceResult | null> {
  const res = await fetch(`/api/places/${encodeURIComponent(placeId)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.data ?? null;
}

export async function fetchCulturalEvents(params: { dtype: string; keyword: string }): Promise<CulturalEvent[]> {
  const search = new URLSearchParams({ dtype: params.dtype });
  if (params.keyword) search.set("keyword", params.keyword);
  const res = await fetch(`/api/cultural-events?${search}`);
  const data = await res.json();
  return res.ok ? data.data : [];
}

export async function fetchSavedPlaces(plannedOnly = false): Promise<SavedPlaceResult[]> {
  const res = await fetch(plannedOnly ? "/api/saved-places?planned=1" : "/api/saved-places");
  if (!res.ok) return [];
  const data = await res.json();
  return data.data ?? [];
}

// date는 "YYYY-MM-DD", null이면 방문 예정 해제(저장 자체는 유지).
export async function putPlannedVisit(placeId: string, date: string | null): Promise<boolean> {
  const res = await fetch("/api/saved-places", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ placeId, plannedVisitAt: date }),
  });
  return res.ok;
}

// 저장한 코스. course는 저장 시점 스냅샷이라 추천 런이 정리된 뒤에도 그대로 열린다.
export type SavedCourseResult = {
  publicId: string;
  title: string;
  savedAt: string;
  course: RecommendResult;
};

export async function fetchSavedCourses(): Promise<SavedCourseResult[]> {
  const res = await fetch("/api/saved-courses");
  if (!res.ok) return [];
  const data = await res.json();
  return data.data ?? [];
}

export async function fetchSavedCourse(publicId: string): Promise<SavedCourseResult | null> {
  const res = await fetch(`/api/saved-courses/${encodeURIComponent(publicId)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.data ?? null;
}

// 코스 내용은 서버가 runId로 DB에서 직접 만든다 — 여기선 어떤 추천이었는지만 넘긴다.
export async function postSavedCourse(runId: string): Promise<boolean> {
  const res = await fetch("/api/saved-courses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runId }),
  });
  return res.ok;
}

export async function deleteSavedCourse(publicId: string): Promise<boolean> {
  const res = await fetch(`/api/saved-courses?publicId=${encodeURIComponent(publicId)}`, {
    method: "DELETE",
  });
  return res.ok;
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

export async function fetchRecentQuestions(): Promise<{ questions: RecentQuestion[]; totalCount: number }> {
  const res = await fetch("/api/recent-questions");
  if (!res.ok) return { questions: [], totalCount: 0 };
  const data = await res.json();
  return { questions: data.data ?? [], totalCount: data.totalCount ?? 0 };
}

export type PlaceReview = {
  author: string;
  avatarUrl?: string | null;
  rating: number;
  text: string;
  postedAt?: string | null;
  tag?: string | null;
};

export type PlaceWithMeta = NonNullable<Recommendation["places"]>[number] & {
  category?: string | null;
  distanceKm?: number | null;
  placeId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  // 코스상 이전 정류지(없으면 사용자 현재 위치)에서 이 장소까지 네이버 Directions로 구한
  // 자동차 이동거리/시간. 실패/미계산이면 없음 — 배지 미표시로 처리한다.
  travelDistanceM?: number | null;
  travelDurationMin?: number | null;
  // 평점/리뷰 — 실제 데이터 소스가 아직 없어서(docs/research/place-reviews-and-mood-data-sources.md)
  // 채우는 곳이 없다. 디자인팀 리뷰 UI(디자인/방문자 리뷰.png)는 이미 나왔고 나중에 실제
  // 데이터 소스가 정해지면 이 필드만 채우면 되도록 타입·표시 UI를 미리 준비해둔다 — 지금은
  // 항상 undefined라 DetailScreen에 아무것도 안 뜬다(지어내지 않는다는 원칙 유지).
  rating?: number | null;
  reviewCount?: number | null;
  reviews?: PlaceReview[] | null;
};
// agentRunId: /recommend/[runId] 라우팅용 — 새로고침/직링크 복원 때 이 id로 결과를 다시 조회한다.
// isOwner: 새로고침/직링크 복원(GET /api/recommend/[runId])에서만 채워진다. false면 남의 링크를
// 열어본 읽기 전용 — 저장·삭제·재요청 같은 소유자 전용 동작을 숨긴다.
export type RecommendResult = Omit<Recommendation, "places"> & { places?: PlaceWithMeta[]; agentRunId: string; isOwner?: boolean };

// 장소 검색(카카오) 결과는 AI 추천이 아니라서 reason/tags/oneLineDescription 같은
// AI 전용 필드가 없다 — DetailScreen/ParkingScreen은 그 필드들을 전부 optional로 다루므로
// 빈 값으로 채워도 그대로 재사용 가능하다(runId 없는 단독 상세 화면용).
export function placeResultToMeta(p: PlaceResult): PlaceWithMeta {
  return {
    name: p.name,
    oneLineDescription: "",
    reason: "",
    address: p.roadAddress ?? undefined,
    category: p.categorySummary ?? undefined,
    placeId: p.id,
    latitude: p.latitude,
    longitude: p.longitude,
    daeguDistrict: (p.daeguDistrict ?? undefined) as PlaceWithMeta["daeguDistrict"],
  };
}
export type RecommendProgressEvent = { type: string; tool?: string };

// 추천 실패 중에서 화면이 다르게 대응해야 하는 것(지금은 한도 초과)만 code로 구분한다.
// 그 외는 지금까지처럼 메시지만 보여준다.
export class RecommendError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "RecommendError";
  }
}

// 거리(km) 배지 계산용 GPS 좌표. 권한 거부/미지원/타임아웃이면 조용히 null —
// 배지가 안 뜰 뿐 추천 자체를 막을 이유는 아니다.
//
// PositionOptions.timeout만 믿지 않는다 — 권한 프롬프트가 떠 있거나 위치
// 프로바이더가 응답이 없는 일부 환경에서는 그 타임아웃이 지켜지지 않고
// getCurrentPosition 콜백이 영영 안 불릴 수 있다(자동화 브라우저에서 45초+
// 멈추는 걸 실제로 확인함). Promise.race로 앱 쪽에서 별도 하드 타임아웃을 건다.
export function getCurrentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  const geo = new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
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
  const hardTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000));
  return Promise.race([geo, hardTimeout]);
}

// /api/recommend는 NDJSON(줄바꿈 구분 JSON)을 스트리밍한다 — 도구 호출 시작/종료,
// 장소 정리 단계를 onProgress로 실시간 전달하고, "result"/"error" 줄로 끝난다.
export async function postRecommend(
  history: ChatTurn[],
  conversationId?: string | null,
  onProgress?: (event: RecommendProgressEvent) => void
): Promise<RecommendResult> {
  const origin = await getCurrentPosition();

  let res: Response;
  try {
    res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history, origin, conversationId }),
    });
  } catch {
    throw new Error("요청에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
  // 한도 초과(402)처럼 서버가 이유를 담아 보낸 응답을 "알 수 없는 오류"로 뭉개면
  // 사용자가 왜 막혔는지 알 방법이 없다 — 본문의 메시지와 code를 그대로 살려 던진다.
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new RecommendError(data?.error ?? "알 수 없는 오류가 발생했습니다.", data?.code);
  }
  if (!res.body) throw new Error("알 수 없는 오류가 발생했습니다.");

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
      if (event.type === "result") {
        result = { ...event.result.recommendation, agentRunId: event.result.agentRunId } as RecommendResult;
      } else if (event.type === "error") errorMessage = event.message;
      else onProgress?.(event);
    }
  }

  if (errorMessage) throw new Error(errorMessage);
  if (!result) throw new Error("알 수 없는 오류가 발생했습니다.");
  return result;
}

// /recommend/[runId] 새로고침/직링크 복원용 — 결과를 DB에서 다시 조회한다.
export async function fetchRecommendation(runId: string): Promise<RecommendResult> {
  const res = await fetch(`/api/recommend/${runId}`);
  if (!res.ok) throw new Error("추천 결과를 찾을 수 없습니다.");
  const data = await res.json();
  return data.data;
}

export type ConversationTurn = { agentRunId: string; userQuery: string; recommendation: RecommendResult };
export type ConversationData = { conversationId: string; regionId: string | null; turns: ConversationTurn[] };

// 사이드바 "대화 기록"에서 과거 대화를 열어 홈 화면으로 이어서 보낼 때 쓴다(로그인 소유자만).
export async function fetchConversation(conversationId: string): Promise<ConversationData> {
  const res = await fetch(`/api/conversations/${conversationId}`);
  if (!res.ok) throw new Error("대화를 찾을 수 없습니다.");
  const data = await res.json();
  return data.data;
}

// /recommend/[runId]/place/[placeId]/parking/[pkltId] 새로고침/직링크 복원용.
export async function fetchParkingSpotById(
  pkltId: string,
  district: string,
  placeName?: string,
  origin?: { latitude?: number | null; longitude?: number | null }
): Promise<ParkingSpotWithDistance | null> {
  const params = new URLSearchParams({ district });
  if (placeName) params.set("placeName", placeName);
  if (origin?.latitude != null && origin.longitude != null) { params.set("latitude", String(origin.latitude)); params.set("longitude", String(origin.longitude)); }
  const res = await fetch(`/api/parking/${encodeURIComponent(pkltId)}?${params}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("주차장 조회에 실패했습니다.");
  const data = await res.json();
  return data.data ?? null;
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
