import { z } from "zod";
import { PHOTO_TAGS } from "./photo-places";

export const PHOTO_FOCUS_LABELS = { background: "배경", mood: "분위기", composition: "구도", color: "색감", overall: "전체 느낌" } as const;
export const photoTasteAnalysisSchema = z.object({
  readable: z.boolean(),
  tags: z.array(z.enum(PHOTO_TAGS)).max(10),
  background: z.string().max(300),
  mood: z.string().max(300),
  composition: z.string().max(300),
  uncertainty: z.string().min(1).max(500),
});
export const photoPreferencesSchema = z.object({
  tags: z.array(z.enum(PHOTO_TAGS)).min(1, "촬영 태그를 1개 이상 선택해 주세요.").max(10).transform((tags) => [...new Set(tags)]),
  focus: z.enum(["background", "mood", "composition", "color", "overall"]),
  note: z.string().trim().max(500, "선호 설명은 500자 이내로 입력해 주세요."),
});
export type PhotoPreferences = z.infer<typeof photoPreferencesSchema>;
export type PhotoTasteAnalysis = z.infer<typeof photoTasteAnalysisSchema>;
