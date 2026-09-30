import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLicensedPlacePhoto } from "@/lib/services/place-photo";
import { approvedPlacePhotos } from "@/lib/approved-place-photos";
import { newestPhoto } from "@/lib/place-photo";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ placeId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { placeId } = await params;
  if (!/^[\w-]{1,64}$/.test(placeId)) return NextResponse.json({ error: "잘못된 장소 ID" }, { status: 400 });
  try {
    const place = await prisma.place.findUnique({ where: { publicId: placeId }, select: { name: true, latitude: true, longitude: true } });
    if (!place) return NextResponse.json({ photo: null }, { status: 404 });
    const automatic = await getLicensedPlacePhoto({ name: place.name, latitude: place.latitude.toNumber(), longitude: place.longitude.toNumber() });
    const photo = newestPhoto([...approvedPlacePhotos(placeId), ...(automatic ? [automatic] : [])]);
    return NextResponse.json({ photo }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ photo: null }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
