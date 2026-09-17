import { z } from "zod";
import { confirmedSituationSchema } from "./trip-situation";
import { photoPreferencesSchema } from "./photo-preferences";

export const TRIP_STORAGE_KEY = "motion.active-trip.v1";
const timestamp = z.string().datetime();
export const parkingLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  label: z.string().trim().min(1).max(100),
  savedAt: timestamp,
  source: z.enum(["gps", "map"]),
  accuracyM: z.number().nonnegative().nullable(),
}).refine((point) => point.latitude !== 0 || point.longitude !== 0, "주차 좌표를 확인해 주세요.");
export type ParkingLocation = z.infer<typeof parkingLocationSchema>;
export const tripStopSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(300),
  address: z.string().max(1000).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  visitedAt: timestamp.nullable(),
  sourceId: z.string().max(150).nullable().optional(),
  category: z.string().max(500).nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  reason: z.string().max(2000).optional(),
  operatingHours: z.string().max(1000).optional(),
  plannedVisitMinutes: z.number().int().min(1).max(240).optional(),
  photoGuide: z.object({ tips: z.array(z.string().max(500)).max(10), notice: z.string().max(1000), plannedTime: z.string().max(50) }).optional(),
}).refine((s) => (s.latitude === null) === (s.longitude === null), "좌표 쌍이 필요합니다.");
export const activeTripSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  sourceRunId: z.string().min(1),
  title: z.string().min(1).max(300),
  revision: z.number().int().nonnegative(),
  status: z.enum(["active", "completed"]),
  startedAt: timestamp,
  updatedAt: timestamp,
  transportMode: z.enum(["walk", "car", "public_transit"]),
  remainingMinutes: z.number().int().min(1).max(1440),
  stops: z.array(tripStopSchema).max(30),
  photoPreferences: z.array(z.string().max(100)).max(20).optional(),
  photoTaste: photoPreferencesSchema.optional(),
  photoPlan: z.object({ date: z.iso.date(), startTime: z.string().max(5), originName: z.string().max(300) }).optional(),
  appliedRoute: z.object({
    id: z.string().max(100), acceptedAt: timestamp,
    origin: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
    estimatedMinutes: z.number().nonnegative(), explanation: z.string().max(2000),
    warnings: z.array(z.string().max(1000)).max(20),
  }).nullable().optional(),
  // 이전 v1 기록에는 이 필드가 없다. 그대로 복원할 수 있도록 선택 필드로 둔다.
  parking: parkingLocationSchema.nullable().optional(),
  situation: confirmedSituationSchema.nullable().optional(),
}).refine((trip) => new Set(trip.stops.map((s) => s.id)).size === trip.stops.length, "장소 ID 중복");
export type ActiveTrip = z.infer<typeof activeTripSchema>;
export type TripStop = z.infer<typeof tripStopSchema>;

export function restoreTrip(raw: string | null): ActiveTrip | null {
  if (raw === null) return null;
  return activeTripSchema.parse(JSON.parse(raw));
}

export function updateTrip(trip: ActiveTrip, change: { stopId: string } | { remainingMinutes: number } | { finish: true }): ActiveTrip {
  if (trip.status !== "active") throw new Error("이미 종료된 여행입니다.");
  const now = new Date().toISOString();
  if ("stopId" in change && !trip.stops.some((s) => s.id === change.stopId)) throw new Error("장소를 찾지 못했습니다.");
  return activeTripSchema.parse({
    ...trip, revision: trip.revision + 1, updatedAt: now, situation: null, appliedRoute: null,
    ...("remainingMinutes" in change ? { remainingMinutes: change.remainingMinutes } : {}),
    ...("finish" in change ? { status: "completed" } : {}),
    stops: "stopId" in change ? trip.stops.map((s) => s.id === change.stopId ? { ...s, visitedAt: s.visitedAt ? null : now } : s) : trip.stops,
  });
}
