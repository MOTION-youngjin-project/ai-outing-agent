import { randomUUID } from "node:crypto";
import type { CallbackHandlerMethods } from "@langchain/core/callbacks/base";

type Tokens = { input_tokens: number; output_tokens: number; total_tokens: number };
function readTokens(value: unknown): Tokens | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return [v.input_tokens, v.output_tokens, v.total_tokens].every(
    n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0,
  ) ? v as Tokens : null;
}

// One tracker per recommendation; fallback models share its ID. No prompts or user IDs.
// Events are cumulative snapshots, not additive records. Late completions update the same ID.
export function createAiUsageTracker(
  operation: "recommendation" | "benchmark" | "suggestion",
  write: (event: Record<string, unknown>) => void = event => console.info("[ai-usage]", JSON.stringify(event)),
) {
  const requestId = randomUUID();
  const calls = new Map<string, { model: string; status: string; tokens: Tokens | null }>();
  function emit() {
    const values = [...calls.values()];
    const measured = values.filter(c => c.tokens !== null);
    try {
      write({ requestId, operation, callCount: values.length,
        completedCalls: values.filter(c => c.status === "completed").length,
        failedCalls: values.filter(c => c.status === "failed").length,
        pendingCalls: values.filter(c => c.status === "pending").length,
        measuredCalls: measured.length, unmeasuredCalls: values.length - measured.length,
        inputTokens: measured.reduce((n, c) => n + c.tokens!.input_tokens, 0),
        outputTokens: measured.reduce((n, c) => n + c.tokens!.output_tokens, 0),
        totalTokens: measured.reduce((n, c) => n + c.tokens!.total_tokens, 0),
        models: [...new Set(values.map(c => c.model))],
      });
    } catch { /* Telemetry must never break a recommendation. */ }
  }
  return {
    callbacks(model: string): CallbackHandlerMethods & { name: string } {
      return {
        name: "motion-ai-usage",
        handleChatModelStart(_llm, _messages, runId) {
          if (calls.has(runId)) return;
          calls.set(runId, { model, status: "pending", tokens: null });
          emit();
        },
        handleLLMEnd(output, runId) {
          const call = calls.get(runId);
          if (!call || call.status !== "pending") return;
          // Gemini returns usage on the aggregated AIMessage (also in streaming mode).
          const generation = output.generations[0]?.[0];
          const message = generation && "message" in generation ? generation.message : null;
          call.tokens = message && typeof message === "object" && "usage_metadata" in message
            ? readTokens(message.usage_metadata) : null;
          call.status = "completed";
          emit();
        },
        handleLLMError(_error, runId) {
          const call = calls.get(runId);
          if (!call || call.status !== "pending") return;
          call.status = "failed";
          emit();
        },
      };
    },
  };
}
