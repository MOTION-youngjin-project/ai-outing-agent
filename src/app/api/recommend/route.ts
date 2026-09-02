import { NextRequest, NextResponse } from "next/server";
import { createRecommendationRun } from "@/lib/services/recommendations";
import type { ChatTurn } from "@/lib/agent";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { history } = await req.json();

  if (!Array.isArray(history) || history.length === 0) {
    return NextResponse.json({ error: "history가 필요합니다." }, { status: 400 });
  }

  try {
    const result = await createRecommendationRun(history as ChatTurn[]);
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "추천 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
