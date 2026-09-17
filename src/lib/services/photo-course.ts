import { randomUUID } from "node:crypto";
import { getTimes } from "suncalc";
import { PHOTO_PLACES } from "../data/daegu-photo-places";
import { type PhotoPlace } from "../photo-places";
import { photoCourseSchema, validatePhotoCourseDate, type PhotoCourseRequest, type PhotoCourse } from "../photo-course";
import { distanceM } from "../trip-replan";

export type PhotoLeg = { minutes: number; estimated: boolean };
export type PhotoCourseDependencies = { leg: (from: PhotoPlace, to: PhotoPlace, mode: PhotoCourseRequest["transportMode"]) => Promise<PhotoLeg | null> };
export class PhotoCourseError extends Error { constructor(message: string, public status = 422) { super(message); } }

export function photoVisitWindow(place: PhotoPlace, input: PhotoCourseRequest) {
  const noon = new Date(`${input.date}T12:00:00+09:00`);
  const midnight = Date.parse(`${input.date}T00:00:00+09:00`);
  const sun = getTimes(noon, place.latitude, place.longitude);
  if (!sun.sunrise || !sun.sunset) return null;
  const sunrise = Math.ceil((sun.sunrise.getTime() - midnight) / 60000);
  const sunset = Math.round((sun.sunset.getTime() - midnight) / 60000);
  if (place.environment === "indoor") {
    // Conservative regular-day schedule; holiday substitutions and exhibition changes require confirmation.
    if (noon.getUTCDay() === 1 || input.date.endsWith("-01-01")) return null;
    const month = Number(input.date.slice(5, 7));
    const close = (month >= 4 && month <= 10 ? 19 : 18) * 60;
    return { open: 600, close, lastEntry: close - 60, shootingTime: "daylight" as const, sunset };
  }
  if (input.preferences.tags.includes("노을") && place.tags.includes("노을")) return { open: sunset - 40, close: sunset + 15, lastEntry: sunset - 10, shootingTime: "before-sunset" as const, sunset };
  if (input.preferences.tags.includes("야경") && place.tags.includes("야경")) return { open: sunset + 15, close: 1380, lastEntry: 1350, shootingTime: "after-sunset" as const, sunset };
  return { open: Math.max(480, sunrise + 30), close: sunset, lastEntry: sunset - 20, shootingTime: "daylight" as const, sunset };
}

export async function createPhotoCourse(input: PhotoCourseRequest, deps: PhotoCourseDependencies, now = new Date(), signal?: AbortSignal): Promise<PhotoCourse> {
  try { validatePhotoCourseDate(input, now); } catch (error) { throw new PhotoCourseError((error as Error).message, 400); }
  const foundOrigin = PHOTO_PLACES.find((p) => p.id === input.originId);
  if (!foundOrigin) throw new PhotoCourseError("출발 장소를 다시 선택해 주세요.", 400);
  const origin: PhotoPlace = foundOrigin;
  const [hour, minute] = input.startTime.split(":").map(Number);
  const start = hour * 60 + minute, deadline = start + input.durationMinutes;
  const focusTags: Record<string, string[]> = { background: ["벽화", "골목", "건축", "자연", "탁 트인 배경"], mood: ["노을", "야경", "골목"], composition: ["실루엣", "인물", "건축"], color: ["노을", "벽화", "자연"], overall: [] };
  const score = (place: PhotoPlace) => place.tags.reduce((n, tag) => n + (input.preferences.tags.includes(tag) ? 10 + (focusTags[input.preferences.focus].includes(tag) ? 3 : 0) : 0) + (input.title.includes(tag) ? 1 : 0), 0);
  const candidates = PHOTO_PLACES.filter((p) => p.tags.some((t) => input.preferences.tags.includes(t))).sort((a, b) => score(b) - score(a) || distanceM(origin, a) - distanceM(origin, b)).slice(0, 4);
  const cache = new Map<string, Promise<PhotoLeg | null>>();
  const leg = (a: PhotoPlace, b: PhotoPlace) => {
    const key = `${a.id}:${b.id}`;
    if (!cache.has(key)) cache.set(key, a.id === b.id ? Promise.resolve({ minutes: 0, estimated: false }) : deps.leg(a, b, input.transportMode).then((value) => value && Number.isFinite(value.minutes) && value.minutes > 0 ? { ...value, minutes: Math.ceil(value.minutes) } : null).catch(() => null));
    return cache.get(key)!;
  };
  type Plan = { stops: PhotoCourse["stops"]; cursor: number; estimated: boolean; returnMinutes: number; rank: number };
  const plans: Plan[] = [];
  let failures = 0;
  async function search(stops: PhotoCourse["stops"], cursor: number, from: PhotoPlace, estimated: boolean): Promise<void> {
    if (stops.length === 3) return;
    signal?.throwIfAborted();
    const trials = await Promise.all(candidates.filter((p) => !stops.some((s) => s.place.id === p.id)).map(async (place) => {
      const window = photoVisitWindow(place, input);
      if (!window || cursor > window.lastEntry) return null;
      const [outward, back] = await Promise.all([leg(from, place), input.transportMode === "car" ? leg(place, origin) : Promise.resolve({ minutes: 0, estimated: false })]);
      if (!outward || !back) { failures++; return null; }
      const reach = cursor + outward.minutes;
      const arrival = Math.max(reach, window.open);
      const departure = arrival + place.estimatedVisitMinutes;
      if (arrival > window.lastEntry || departure > window.close || departure + back.minutes > deadline) return null;
      return { place, window, outward, back, arrival, departure, wait: arrival - reach };
    }));
    signal?.throwIfAborted();
    await Promise.all(trials.filter((t) => t !== null).map(async (trial) => {
      const next = [...stops, { place: trial.place, arrivalMinute: trial.arrival, departureMinute: trial.departure, travelMinutes: trial.outward.minutes, waitMinutes: trial.wait, matchTags: trial.place.tags.filter((t) => input.preferences.tags.includes(t)), shootingTime: trial.window.shootingTime }];
      const nextEstimated = estimated || trial.outward.estimated;
      plans.push({ stops: next, cursor: trial.departure, estimated: nextEstimated || trial.back.estimated, returnMinutes: trial.back.minutes, rank: new Set(next.flatMap((s) => s.matchTags)).size * 100 + next.reduce((n, s) => n + score(s.place), 0) });
      await search(next, trial.departure, trial.place, nextEstimated);
    }));
  }
  await search([], start, origin, false);
  const travel = (plan: Plan) => plan.returnMinutes + plan.stops.reduce((sum, stop) => sum + stop.travelMinutes, 0);
  plans.sort((a, b) => b.rank - a.rank || a.cursor + a.returnMinutes - b.cursor - b.returnMinutes || travel(a) - travel(b) || a.stops.map((s) => s.place.id).join().localeCompare(b.stops.map((s) => s.place.id).join()));
  const { stops, cursor, estimated, returnMinutes } = plans[0] ?? { stops: [], cursor: start, estimated: false, returnMinutes: 0 };
  if (!stops.length) throw new PhotoCourseError(failures ? "이동 경로를 확인하지 못했습니다. 이동수단을 바꾸거나 잠시 후 다시 시도해 주세요." : "선택한 시간과 취향에 맞는 촬영 장소를 배치하지 못했습니다. 출발 시각·여행 시간·태그를 조정해 주세요.", failures ? 503 : 422);
  const warnings = ["장소 대표 좌표로 계산한 계획입니다. 실제 입구·현장 통제·촬영 허용 여부를 확인해 주세요.", "공휴일 대체 휴관·설날·추석·임시 휴관은 자동 확인하지 않습니다. 방문일 운영 안내를 확인해 주세요.", "일몰은 계산값이며 지형·구름·날씨에 따라 보이는 시각과 촬영 결과가 달라집니다. 날씨 예보는 조회하지 않았습니다.", "확정 태그와 중요 요소, 제목의 태그 키워드로 후보를 정했습니다. 자유 설명의 세부 조건은 자동 검증되지 않으므로 촬영 안내와 함께 확인해 주세요."];
  if (estimated) warnings.push("일부 도보 이동은 직선거리 × 1.4 ÷ 분당 60m 추정치입니다. 실제 보행 경로와 다를 수 있습니다.");
  const unmatched = input.preferences.tags.filter((tag) => !stops.some((s) => s.matchTags.includes(tag)));
  if (unmatched.length) warnings.push(`이번 시간표에 반영하지 못한 태그: ${unmatched.join(" · ")}. 시각이나 출발지를 조정해 보세요.`);
  if (input.transportMode === "car") warnings.push("장소마다 자동차로 이동하고 주차하는 계획으로 주차·승하차 여유 10분을 각 이동 구간에 포함했습니다. 마지막에는 출발지로 복귀합니다. 주차장 위치·주차 가능 여부는 별도 확인하세요.");
  if (input.transportMode === "public_transit") warnings.push("대중교통 시간은 현재 조회 시점의 참고값이며 선택한 방문일·각 출발 시각의 배차를 반영하지 못합니다. 출발 전에 다시 확인하세요.");
  if (input.transportMode === "car") warnings.push("자동차 시간은 현재 교통 조회값입니다. 선택한 방문일의 교통 상황을 보장하지 않습니다.");
  return photoCourseSchema.parse({ id: `photo-course:${randomUUID()}`, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 15 * 60000).toISOString(), input, origin, stops, totalMinutes: cursor + returnMinutes - start, returnMinutes, endMinute: cursor + returnMinutes, sunsetMinute: photoVisitWindow(origin, input)?.sunset ?? photoVisitWindow(PHOTO_PLACES[1], input)!.sunset, warnings });
}
