import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";

export async function POST(req: NextRequest) {
  const { message } = await req.json();

  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message가 필요합니다." }, { status: 400 });
  }

  try {
    const reply = await runAgent(message);
    return NextResponse.json({ reply });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "에이전트 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
