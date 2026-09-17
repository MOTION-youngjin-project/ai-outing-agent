import { MAX_PHOTO_BYTES } from "@/lib/photo-input";
import { scenePhotoSchema } from "@/lib/scene-photo";
import { analyzeScenePhoto, normalizeScenePhoto, ScenePhotoError } from "./scene-photo";

export async function handleScenePhoto(request: Request, analyze = analyzeScenePhoto) {
  return handlePhotoAnalysis(request, analyze, scenePhotoSchema);
}

export async function handlePhotoAnalysis<T>(request: Request, analyze: (jpeg: Buffer, signal: AbortSignal) => Promise<T>, schema: { parse: (value: unknown) => T }) {
  const headers = { "Cache-Control": "private, no-store" };
  const respond = (body: unknown, status = 200) => Response.json(body, { status, headers });
  try {
    const mime = request.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new ScenePhotoError("JPEG·PNG·WebP 사진을 보내 주세요.", 415);
    if (Number(request.headers.get("content-length")) > MAX_PHOTO_BYTES) throw new ScenePhotoError("사진은 10MB 이하로 선택해 주세요.", 413);
    const reader = request.body?.getReader();
    if (!reader) throw new ScenePhotoError("사진을 선택해 주세요.");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_PHOTO_BYTES) { await reader.cancel(); throw new ScenePhotoError("사진은 10MB 이하로 선택해 주세요.", 413); }
      chunks.push(part.value);
    }
    const jpeg = await normalizeScenePhoto(Buffer.concat(chunks), mime);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30000)]);
    const analysis = await analyze(jpeg, signal);
    return respond({ analysis: schema.parse(analysis) });
  } catch (error) {
    if (error instanceof ScenePhotoError) return respond({ error: error.message }, error.status);
    return respond({ error: "사진 분석을 완료하지 못했습니다. 다시 시도하거나 직접 입력해 주세요." }, 502);
  }
}
