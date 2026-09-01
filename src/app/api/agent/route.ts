import { NextRequest, NextResponse } from "next/server";
import { runAgent, type ChatTurn } from "@/lib/agent";

export async function POST(req: NextRequest) {
  const { history } = await req.json();

  if (!Array.isArray(history) || history.length === 0) {
    return NextResponse.json({ error: "history가 필요합니다." }, { status: 400 });
  }

  try {
    const reply = await runAgent(history as ChatTurn[]);
    return NextResponse.json({ reply });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "에이전트 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
