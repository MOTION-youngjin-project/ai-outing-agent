import { apiError } from "../../../lib/api";
import { CULTURE_DTYPES, fetchCulturePortal } from "../../../lib/tools/culturePortal";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const dtype = searchParams.get("dtype")?.trim();
    const keyword = searchParams.get("keyword")?.trim() ?? "";

    if (!dtype || !(CULTURE_DTYPES as readonly string[]).includes(dtype)) {
      return apiError(400, "INVALID_DTYPE", "dtype 값이 올바르지 않습니다.", {
        allowed: CULTURE_DTYPES.join(", "),
      });
    }
    if (keyword.length > 100) return apiError(400, "INVALID_KEYWORD", "keyword는 100자 이하여야 합니다.");

    const data = await fetchCulturePortal(dtype, keyword);
    return Response.json({ count: data.length, data });
  } catch (error) {
    console.error("문화행사 조회 실패", error);
    return apiError(502, "CULTURE_API_ERROR", "문화행사 API 조회에 실패했습니다.");
  }
}
