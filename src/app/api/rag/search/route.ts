import { searchPdfGuides } from "@/lib/tools/pdfGuide";
export async function GET(req: Request) {
  const query = new URL(req.url).searchParams.get("query")?.trim();
  if (!query || query.length > 300) return Response.json({ error: "query는 1~300자로 입력해 주세요." }, { status: 400 });
  try { return Response.json({ data: await searchPdfGuides(query) }); }
  catch { return Response.json({ error: "PDF 자료를 조회하지 못했습니다." }, { status: 503 }); }
}
