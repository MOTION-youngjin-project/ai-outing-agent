import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";

export async function POST(req: NextRequest) {
  const { message } = await req.json();

  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message가 필요합니다." }, { status: 400 });
  }

  const reply = await runAgent(message);
  return NextResponse.json({ reply });
}
