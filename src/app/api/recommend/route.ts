import { NextRequest, NextResponse } from "next/server";
import { createRecommendationRun, type RecommendationProgressEvent } from "@/lib/services/recommendations";
import type { ChatTurn } from "@/lib/agent";

export const runtime = "nodejs";

// NDJSON(줄바꿈으로 구분된 JSON) 스트림 — 진행 상황(도구 호출 시작/종료, 장소 정리 중)을
// 실시간으로 내려보내고 마지막 줄에 최종 결과를 담는다. SSE 대신 이 방식을 쓴 이유는
// POST 바디로 history를 보내야 해서(EventSource는 GET만 지원) 그냥 스트리밍 fetch가 더 간단함.
function toLine(event: RecommendationProgressEvent | { type: "result"; result: unknown } | { type: "error"; message: string }) {
  return `${JSON.stringify(event)}\n`;
}

export async function POST(req: NextRequest) {
  const { history } = await req.json();

  if (!Array.isArray(history) || history.length === 0) {
    return NextResponse.json({ error: "history가 필요합니다." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      // runAgentStream의 도구 호출 리스너는 fire-and-forget이라, 최종 결과를 보내고
      // 컨트롤러를 닫은 뒤에도 뒤늦게 tool_end 이벤트가 들어올 수 있다 — 닫힌 컨트롤러에
      // enqueue하면 예외가 나므로 조용히 무시한다(클라이언트는 이미 응답을 다 받은 뒤라 영향 없음).
      const emit = (event: Parameters<typeof toLine>[0]) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(toLine(event)));
        } catch {
          // 컨트롤러가 그 사이 닫혔어도 무시
        }
      };
      try {
        const result = await createRecommendationRun(history as ChatTurn[], emit);
        emit({ type: "result", result });
      } catch (err) {
        console.error(err);
        emit({ type: "error", message: err instanceof Error ? err.message : "추천 생성 중 오류가 발생했습니다." });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
