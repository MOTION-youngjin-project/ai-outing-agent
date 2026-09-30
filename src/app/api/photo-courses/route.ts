import { photoCourseRequestSchema } from "@/lib/photo-course";
import { createPhotoCourse, PhotoCourseError } from "@/lib/services/photo-course";
import { photoCourseProviders } from "@/lib/services/photo-course-providers";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    if (Number(request.headers.get("content-length")) > 12000) return Response.json({ error: "요청이 너무 큽니다." }, { status: 413, headers });
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "여행 조건이 필요합니다." }, { status: 400, headers });
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 12000) { await reader.cancel(); return Response.json({ error: "요청이 너무 큽니다." }, { status: 413, headers }); } chunks.push(part.value); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return Response.json({ error: "여행 조건을 확인해 주세요." }, { status: 400, headers }); }
    const parsed = photoCourseRequestSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "제목·날짜·시간·이동수단·확정 취향을 확인해 주세요." }, { status: 400, headers });
    const course = await createPhotoCourse(parsed.data, photoCourseProviders, new Date(), AbortSignal.any([request.signal, AbortSignal.timeout(45000)]));
    return Response.json({ course }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof PhotoCourseError ? error.message : "코스 생성에 실패했습니다. 잠시 후 다시 시도해 주세요." }, { status: error instanceof PhotoCourseError ? error.status : 502, headers });
  }
}
