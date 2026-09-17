import { NextResponse } from "next/server";
import { replanRequestSchema } from "@/lib/trip-replan";
import { createTripReplan, ReplanError } from "@/lib/services/trip-replanning";
import { tripReplanProviders } from "@/lib/services/trip-replan-providers";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
// 여행은 기기에 저장된 요청 스냅샷만 사용한다. 다른 사용자의 추천 기록을 읽거나 갱신하지 않는다.
export async function POST(request: Request) {
  let body: unknown;
  try {
    if (Number(request.headers.get("content-length")) > 100000) return NextResponse.json({ error: "요청이 너무 큽니다." }, { status: 413, headers });
    const reader = request.body?.getReader();
    if (!reader) throw new Error("empty");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 100000) { await reader.cancel(); return NextResponse.json({ error: "요청이 너무 큽니다." }, { status: 413, headers }); } chunks.push(part.value); }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return NextResponse.json({ error: "올바른 여행 정보가 필요합니다." }, { status: 400, headers }); }
  const parsed = replanRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "여행 정보와 체류 시간(5~120분)을 확인해 주세요." }, { status: 400, headers });
  try {
    const proposal = await createTripReplan(parsed.data.trip, parsed.data.visitMinutes, tripReplanProviders);
    return NextResponse.json({ proposal }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ReplanError ? error.message : "재추천 중 오류가 발생했습니다. 기존 코스는 유지됩니다." }, { status: error instanceof ReplanError ? error.status : 502, headers });
  }
}
