import { z } from "zod";

export const PHOTO_TAGS = ["노을", "실루엣", "탁 트인 배경", "야경", "인물", "벽화", "골목", "건축", "전시", "자연"] as const;
export const photoPlaceQuerySchema = z.object({
  tag: z.enum(PHOTO_TAGS).optional(),
  environment: z.enum(["indoor", "outdoor"]).optional(),
}).strict();
export const photoPlaceSchema = z.object({
  id: z.string().regex(/^photo:[a-z-]+$/),
  name: z.string().min(1), aliases: z.array(z.string().min(1)),
  address: z.string().startsWith("대구광역시"),
  latitude: z.number().min(35.6).max(36.3), longitude: z.number().min(128.2).max(129),
  coordinateUse: z.literal("venue-reference"),
  environment: z.enum(["indoor", "outdoor"]),
  shootingArea: z.string().min(1),
  tags: z.array(z.enum(PHOTO_TAGS)).min(1),
  suggestedTimes: z.array(z.enum(["daylight", "before-sunset", "after-sunset"])).min(1),
  estimatedVisitMinutes: z.number().int().min(10).max(120),
  hours: z.string().min(1), closures: z.string().min(1),
  shootingTips: z.array(z.string().min(1)).min(1),
  visitNotice: z.string().min(1),
  indoorPhotoPermission: z.enum(["check-on-site", "not-applicable"]),
  checkedAt: z.iso.date(),
  sources: z.array(z.object({ label: z.string().min(1), url: z.url(), fields: z.array(z.enum(["location", "hours", "features", "access"])).min(1) })).min(1),
}).superRefine((place, ctx) => {
  if (place.environment === "indoor" && place.indoorPhotoPermission !== "check-on-site") ctx.addIssue({ code: "custom", message: "실내 촬영 허용 여부 확인 필요" });
  for (const field of ["location", "hours", "features"] as const) {
    if (!place.sources.some((source) => source.fields.includes(field))) ctx.addIssue({ code: "custom", message: `${field} 출처 필요` });
  }
});
export type PhotoPlace = z.infer<typeof photoPlaceSchema>;

export const PHOTO_TIME_LABELS = { daylight: "밝은 낮", "before-sunset": "일몰 전", "after-sunset": "일몰 후" } as const;
export const PHOTO_CATALOG_NOTICE = "촬영 태그·시간대·구도·체류 시간은 motion의 제안입니다. 운영시간은 확인일 기준이며 방문일의 휴무·촬영 허용 여부를 다시 확인해 주세요. 좌표는 장소 대표 위치이며 촬영 지점이나 출입구를 보장하지 않습니다. 노을·야경은 날짜와 날씨에 따라 달라집니다.";

export function filterPhotoPlaces(places: readonly PhotoPlace[], query: z.infer<typeof photoPlaceQuerySchema>) {
  return places.filter((place) => (!query.tag || place.tags.includes(query.tag)) && (!query.environment || place.environment === query.environment));
}
