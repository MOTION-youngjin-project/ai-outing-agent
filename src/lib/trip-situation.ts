import { z } from "zod";

export const SITUATION_LABELS = {
  rain: "비가 와요", crowded: "너무 붐벼요", closed: "휴무예요", tired: "쉬고 싶어요", other: "직접 입력",
} as const;
export const situationSchema = z.object({
  reason: z.enum(["rain", "crowded", "closed", "tired", "other"]),
  detail: z.string().trim().max(1000, "상황 설명은 1,000자 이내로 입력해 주세요."),
  affectedStopId: z.string().min(1).nullable(),
  remainingMinutes: z.number().int().min(1).max(1440),
  currentLocation: z.object({
    latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
    source: z.enum(["gps", "stop"]),
    stopId: z.string().min(1).nullable(),
    accuracyM: z.number().nonnegative().nullable(),
    capturedAt: z.string().datetime(),
  }).refine((p) => p.latitude !== 0 || p.longitude !== 0, "현재 위치를 확인해 주세요.")
    .refine((p) => p.source === "stop" ? p.stopId !== null : p.stopId === null, "위치 선택을 확인해 주세요."),
}).superRefine((value, ctx) => {
  if (value.reason === "other" && !value.detail) ctx.addIssue({ code: "custom", path: ["detail"], message: "변경하고 싶은 상황을 입력해 주세요." });
  if ((value.reason === "closed" || value.reason === "crowded") && !value.affectedStopId) ctx.addIssue({ code: "custom", path: ["affectedStopId"], message: "휴무 또는 혼잡한 장소를 선택해 주세요." });
});
export const confirmedSituationSchema = situationSchema.and(z.object({
  baseRevision: z.number().int().nonnegative(), confirmedAt: z.string().datetime(),
}));
export type TripSituationInput = z.infer<typeof situationSchema>;
export type ConfirmedSituation = z.infer<typeof confirmedSituationSchema>;
