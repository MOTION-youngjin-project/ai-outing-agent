import { NextResponse } from "next/server";
import { getCachedPlaceById } from "@/lib/services/places";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ placeId: string }> }) {
  const { placeId } = await params;
  const place = await getCachedPlaceById(placeId);
  if (!place) {
    return NextResponse.json({ error: "존재하지 않는 장소입니다." }, { status: 404 });
  }
  return NextResponse.json({ data: place });
}
