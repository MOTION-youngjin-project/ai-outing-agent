import { z } from "zod";
import { photoPreferencesSchema } from "./photo-preferences";
import { photoPlaceSchema } from "./photo-places";
import { activeTripSchema } from "./active-trip";

export const photoCourseRequestSchema = z.object({
  title: z.string().trim().min(1).max(300), date: z.iso.date(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.number().int().min(30).max(720),
  transportMode: z.enum(["walk", "car", "public_transit"]),
  originId: z.string().min(1).max(100),
  preferences: photoPreferencesSchema,
}).strict();
export const photoCourseStopSchema = z.object({
  place: photoPlaceSchema, arrivalMinute: z.number().int(), departureMinute: z.number().int(),
  travelMinutes: z.number().int().nonnegative(), waitMinutes: z.number().int().nonnegative(),
  matchTags: z.array(z.string()), shootingTime: z.enum(["daylight", "before-sunset", "after-sunset"]),
});
export const photoCourseSchema = z.object({
  id: z.string(), createdAt: z.iso.datetime(), expiresAt: z.iso.datetime(), input: photoCourseRequestSchema,
  origin: photoPlaceSchema, stops: z.array(photoCourseStopSchema).min(1).max(3),
  totalMinutes: z.number().int().positive(), returnMinutes: z.number().int().nonnegative(),
  endMinute: z.number().int().min(0).max(1440), sunsetMinute: z.number().int().min(0).max(1440), warnings: z.array(z.string()),
}).superRefine((course, ctx) => {
  const fail = () => ctx.addIssue({ code: "custom", message: "코스 시간표와 여행 조건이 일치하지 않습니다." });
  const [h, m] = course.input.startTime.split(":").map(Number);
  let cursor = h * 60 + m;
  if (course.origin.id !== course.input.originId || new Set(course.stops.map((s) => s.place.id)).size !== course.stops.length) fail();
  for (const stop of course.stops) {
    if (stop.arrivalMinute !== cursor + stop.travelMinutes + stop.waitMinutes || stop.departureMinute - stop.arrivalMinute !== stop.place.estimatedVisitMinutes) fail();
    cursor = stop.departureMinute;
  }
  if (course.endMinute !== cursor + course.returnMinutes || course.totalMinutes !== course.endMinute - h * 60 - m || course.totalMinutes > course.input.durationMinutes || (course.input.transportMode !== "car" && course.returnMinutes !== 0)) fail();
});
export type PhotoCourseRequest = z.infer<typeof photoCourseRequestSchema>;
export type PhotoCourse = z.infer<typeof photoCourseSchema>;
export function koreanDate(now = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export function minuteLabel(minute: number) { return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`; }
export function validatePhotoCourseDate(input: PhotoCourseRequest, now = new Date()) {
  const start = Date.parse(`${input.date}T${input.startTime}:00+09:00`);
  if (!Number.isFinite(start) || start < now.getTime() - 60000 || start > now.getTime() + 366 * 86400000) throw new Error("출발 시각은 현재 이후부터 1년 이내로 선택해 주세요.");
  const [h, m] = input.startTime.split(":").map(Number);
  if (h * 60 + m + input.durationMinutes > 1440) throw new Error("초기 코스는 방문일 자정 전까지로 설정해 주세요.");
}
export function tripFromPhotoCourse(course: PhotoCourse, current: PhotoCourseRequest, now = new Date()) {
  const parsed = photoCourseSchema.parse(course);
  if (JSON.stringify(parsed.input) !== JSON.stringify(photoCourseRequestSchema.parse(current))) throw new Error("촬영 취향 또는 여행 조건이 바뀌었습니다. 코스를 다시 생성해 주세요.");
  if (Date.parse(parsed.expiresAt) <= now.getTime()) throw new Error("코스 제안이 오래되었습니다. 다시 생성해 주세요.");
  if (parsed.input.date !== koreanDate(now)) throw new Error("방문 당일 코스를 다시 생성한 후 여행을 시작해 주세요.");
  const plannedStart = Date.parse(`${parsed.input.date}T${parsed.input.startTime}:00+09:00`);
  if (Math.abs(now.getTime() - plannedStart) > 15 * 60000) throw new Error("실제 출발 시각에 맞춰 코스를 다시 생성해 주세요. 시작은 계획 시각 전후 15분 이내에 가능합니다.");
  const timestamp = now.toISOString();
  return activeTripSchema.parse({ version: 1, id: `trip:${parsed.id}`, sourceRunId: parsed.id, title: parsed.input.title,
    revision: 0, status: "active", startedAt: timestamp, updatedAt: timestamp,
    transportMode: parsed.input.transportMode, remainingMinutes: parsed.input.durationMinutes,
    photoPreferences: parsed.input.preferences.tags, photoTaste: parsed.input.preferences,
    photoPlan: { date: parsed.input.date, startTime: parsed.input.startTime, originName: parsed.origin.name },
    stops: parsed.stops.map((stop) => ({ id: stop.place.id, sourceId: stop.place.id, name: stop.place.name, address: stop.place.address,
      latitude: stop.place.latitude, longitude: stop.place.longitude, visitedAt: null,
      tags: [...stop.place.tags, stop.place.environment === "indoor" ? "실내" : "야외"],
      reason: `촬영 태그: ${stop.matchTags.join(" · ")}`, operatingHours: stop.place.hours,
      plannedVisitMinutes: stop.departureMinute - stop.arrivalMinute,
      photoGuide: { tips: stop.place.shootingTips, notice: stop.place.visitNotice, plannedTime: `${minuteLabel(stop.arrivalMinute)}~${minuteLabel(stop.departureMinute)}` },
    })),
  });
}
