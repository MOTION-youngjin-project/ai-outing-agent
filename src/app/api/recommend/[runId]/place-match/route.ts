import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GUEST_COOKIE, guestHash } from "@/lib/recommendation-owner";
import { getCachedPlaceById, recoverPlaceMatch } from "@/lib/services/places";
import { extractCategoryLabel } from "@/lib/services/matching";
import type { RecommendResult, PlaceWithMeta } from "@/lib/clientApi";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const body = await request.json().catch(() => null);
  const placeIndex = body?.placeIndex;
  const selectedExternalId = body?.selectedExternalId;
  if (!Number.isInteger(placeIndex) || placeIndex < 0 || (selectedExternalId !== undefined && (typeof selectedExternalId !== "string" || !/^\d+$/.test(selectedExternalId)))) {
    return NextResponse.json({ error: "장소 재검색 요청이 올바르지 않습니다." }, { status: 400 });
  }

  const session = await auth();
  const sessionKeyHash = guestHash(request.cookies.get(GUEST_COOKIE)?.value);
  const run = await prisma.agentRun.findFirst({
    where: { id: runId, expiresAt: { gt: new Date() }, status: { in: ["completed", "partial"] } },
    include: { currentRegion: { include: { parent: true } } },
  });
  if (!run) return NextResponse.json({ error: "추천이 없거나 만료되었습니다." }, { status: 404 });
  const isOwner = session?.user?.id && /^\d+$/.test(session.user.id)
    ? run.userId === BigInt(session.user.id)
    : !!sessionKeyHash && run.userId === null && run.sessionKeyHash === sessionKeyHash;
  if (!isOwner) return NextResponse.json({ error: "이 추천의 장소를 변경할 권한이 없습니다." }, { status: 403 });

  const recommendation = run.recommendationJson as unknown as RecommendResult | null;
  const places = recommendation?.places;
  const original = places?.[placeIndex];
  if (!recommendation || !places || !original) {
    return NextResponse.json({ error: "재검색할 추천 장소를 찾을 수 없습니다." }, { status: 404 });
  }
  if (original.placeId) return NextResponse.json({ data: { place: original, candidates: [] } });

  const neighbor = [...places.slice(0, placeIndex).reverse(), ...places.slice(placeIndex + 1)]
    .find(place => typeof place.latitude === "number" && typeof place.longitude === "number");
  const region = run.currentRegion?.level === "구군" ? run.currentRegion.parent?.name : run.currentRegion?.name;

  try {
    const recovered = await recoverPlaceMatch(original.name, region, {
      address: original.address,
      district: original.daeguDistrict,
      reference: neighbor ? { latitude: neighbor.latitude!, longitude: neighbor.longitude! } : null,
    }, selectedExternalId);
    if (!recovered.place) return NextResponse.json({ data: { place: null, candidates: recovered.candidates } });

    const cached = await getCachedPlaceById(recovered.place.publicId);
    if (!cached) throw new Error("선택 장소를 저장하지 못했습니다.");
    const resolved: PlaceWithMeta = {
      ...original,
      name: cached.name,
      address: cached.roadAddress ?? original.address,
      category: extractCategoryLabel(cached.categorySummary),
      placeId: cached.id,
      latitude: cached.latitude,
      longitude: cached.longitude,
      daeguDistrict: cached.daeguDistrict ?? original.daeguDistrict,
    };
    const updatedPlaces = places.map((place, index) => index === placeIndex ? resolved : place);
    await prisma.agentRun.update({
      where: { id: runId },
      data: { recommendationJson: JSON.parse(JSON.stringify({ ...recommendation, places: updatedPlaces })) },
    });
    return NextResponse.json({ data: { place: resolved, candidates: [] } });
  } catch (error) {
    console.error(`장소 재검색 실패(${original.name}):`, error);
    return NextResponse.json({ error: "장소 정보를 다시 찾지 못했습니다." }, { status: 502 });
  }
}
