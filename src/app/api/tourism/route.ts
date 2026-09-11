import { searchDaeguTourismCached } from "@/lib/external/tour-api";
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const keyword = params.get("keyword")?.trim() ?? "";
  const limit = Number(params.get("limit") ?? 5);
  if (keyword.length > 100 || !Number.isInteger(limit) || limit < 1 || limit > 10) return Response.json({ error: "keyword는 100자 이하, limit는 1~10이어야 합니다." }, { status: 400 });
  try { return Response.json(await searchDaeguTourismCached(keyword, limit)); }
  catch { return Response.json({ error: "관광정보를 불러오지 못했습니다." }, { status: 503 }); }
}
