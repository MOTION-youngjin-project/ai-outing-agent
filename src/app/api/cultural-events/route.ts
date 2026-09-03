import { NextResponse } from "next/server";
import { DTYPES, fetchCulturePortal } from "@/lib/tools/culturePortal";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dtype = searchParams.get("dtype");
  const keyword = searchParams.get("keyword") ?? "";

  if (!dtype || !DTYPES.includes(dtype as (typeof DTYPES)[number])) {
    return NextResponse.json(
      { error: `dtype은 다음 중 하나여야 합니다: ${DTYPES.join(", ")}` },
      { status: 400 }
    );
  }
  if (keyword.length > 100) {
    return NextResponse.json({ error: "keyword는 최대 100자입니다." }, { status: 400 });
  }

  try {
    const data = await fetchCulturePortal(dtype, keyword);
    return NextResponse.json({ count: data.length, data });
  } catch (error) {
    console.error("문화행사 조회 실패", error);
    return NextResponse.json({ error: "문화행사 조회에 실패했습니다." }, { status: 502 });
  }
}
