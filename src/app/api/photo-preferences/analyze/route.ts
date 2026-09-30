import { photoTasteAnalysisSchema } from "@/lib/photo-preferences";
import { analyzePhotoTaste } from "@/lib/services/photo-taste";
import { handlePhotoAnalysis } from "@/lib/services/scene-photo-request";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handlePhotoAnalysis(request, analyzePhotoTaste, photoTasteAnalysisSchema);
}
