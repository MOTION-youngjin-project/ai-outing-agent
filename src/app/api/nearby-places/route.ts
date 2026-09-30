import { NextResponse } from "next/server";
import { z } from "zod";
import { NEARBY_KINDS, searchNearby } from "@/lib/services/nearby";

export const runtime = "nodejs";
const Input = z.object({
  latitude: z.coerce.number().finite().min(-90).max(90),
  longitude: z.coerce.number().finite().min(-180).max(180),
  kind: z.enum(NEARBY_KINDS),
  radius: z.enum(["1000", "3000"]),
});
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = Input.safeParse({ latitude: params.get("latitude") || "invalid", longitude: params.get("longitude") || "invalid", kind: params.get("kind"), radius: params.get("radius") ?? "1000" });
  if (!parsed.success) return NextResponse.json({ error: "주변 검색 조건이 올바르지 않습니다." }, { status: 400 });
  if (!process.env.KAKAO_API_KEY) return NextResponse.json({ error: "주변 장소 검색이 아직 준비되지 않았습니다." }, { status: 503 });
  try {
    const { latitude, longitude, kind, radius } = parsed.data;
    return NextResponse.json({ data: await searchNearby(latitude, longitude, kind, Number(radius)) });
  } catch {
    return NextResponse.json({ error: "주변 장소를 불러오지 못했습니다. 다시 시도해 주세요." }, { status: 502 });
  }
}
