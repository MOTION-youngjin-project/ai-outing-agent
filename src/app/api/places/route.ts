import { apiError } from "../../../lib/api";
import { searchAndCachePlaces } from "../../../lib/services/places";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("query")?.trim();
  if (!query) return apiError(400, "INVALID_QUERY", "query가 필요합니다.");
  if (query.length > 100) return apiError(400, "INVALID_QUERY", "query는 100자 이하여야 합니다.");

  try {
    const data = await searchAndCachePlaces(query);
    return Response.json({ count: data.length, data });
  } catch (error) {
    console.error("장소 검색 실패", error);
    const message = error instanceof Error ? error.message : "장소 검색에 실패했습니다.";
    const status = message.includes("NAVER_API_HUB_CLIENT_") ? 503 : 502;
    return apiError(status, status === 503 ? "API_KEY_NOT_CONFIGURED" : "PLACE_API_ERROR", message);
  }
}
