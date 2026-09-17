import { z } from "zod";

export const scenePhotoSchema = z.object({
  readable: z.boolean(),
  observedText: z.string().max(1500),
  reason: z.enum(["closed", "crowded", "rain", "other"]),
  detail: z.string().trim().max(1000),
  uncertainty: z.string().trim().min(1).max(500),
});
export type ScenePhotoAnalysis = z.infer<typeof scenePhotoSchema>;
export type SceneDraft = Pick<ScenePhotoAnalysis, "reason" | "detail">;
