import { PHOTO_PLACES } from "@/lib/data/daegu-photo-places";
import { filterPhotoPlaces, PHOTO_CATALOG_NOTICE, photoPlaceQuerySchema } from "@/lib/photo-places";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = photoPlaceQuerySchema.safeParse(Object.fromEntries(params));
  if (!query.success || [...params.keys()].some((key) => params.getAll(key).length > 1)) {
    return Response.json({ error: "촬영 태그와 실내외 조건을 확인해 주세요." }, { status: 400 });
  }
  return Response.json({ places: filterPhotoPlaces(PHOTO_PLACES, query.data), notice: PHOTO_CATALOG_NOTICE }, { headers: { "Cache-Control": "no-store" } });
}
