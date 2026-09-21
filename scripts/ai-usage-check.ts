import assert from "node:assert/strict";
import { test } from "node:test";
import { AIMessage, AIMessageChunk } from "@langchain/core/messages";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { createAiUsageTracker } from "../src/lib/ai-usage";
import { ChatGenerationChunk } from "@langchain/core/outputs";

// The library fake discards usage_metadata; preserve provider-shaped messages here.
class UsageModel extends FakeStreamingChatModel {
  async _generate() {
    if (this.thrownErrorString) throw Error(this.thrownErrorString);
    return { generations: [{ text: "", message: this.responses[0] as AIMessage }] };
  }
  async *_streamResponseChunks() {
    for (const message of this.chunks) yield new ChatGenerationChunk({ text: "", message });
  }
}

test("real callback lifecycle accumulates calls across fallback models without logging prompts", async () => {
  const events: Record<string, unknown>[] = [];
  const tracker = createAiUsageTracker("recommendation", e => events.push(e));
  for (const model of ["first", "fallback"]) {
    await new UsageModel({
      responses: [new AIMessage({ content: "private reply", usage_metadata: { input_tokens: 10, output_tokens: 4, total_tokens: 14 } })],
      callbacks: [tracker.callbacks(model)],
    }).invoke("private prompt");
  }
  assert.equal(events.at(-1)?.callCount, 2);
  assert.equal(events.at(-1)?.inputTokens, 20);
  assert.equal(events.at(-1)?.outputTokens, 8);
  assert.equal(events.at(-1)?.unmeasuredCalls, 0);
  assert.equal(new Set(events.map(e => e.requestId)).size, 1);
  assert.ok(!JSON.stringify(events).includes("private"));
});

test("stream chunks are counted once with aggregated usage", async () => {
  const events: Record<string, unknown>[] = [];
  const tracker = createAiUsageTracker("recommendation", e => events.push(e));
  const model = new UsageModel({ chunks: [
    new AIMessageChunk({ content: "a" }),
    new AIMessageChunk({ content: "b", usage_metadata: { input_tokens: 12, output_tokens: 2, total_tokens: 14 } }),
  ], callbacks: [tracker.callbacks("stream")] });
  for await (const chunk of await model.stream("hello")) void chunk;
  assert.equal(events.at(-1)?.callCount, 1);
  assert.equal(events.at(-1)?.totalTokens, 14);
  assert.equal(events.at(-1)?.completedCalls, 1);
});

test("failures and missing metadata stay unmeasured", async () => {
  const events: Record<string, unknown>[] = [];
  const tracker = createAiUsageTracker("suggestion", e => events.push(e));
  await assert.rejects(new FakeStreamingChatModel({ thrownErrorString: "failed",
    callbacks: [tracker.callbacks("failed")] }).invoke("hello"));
  await new FakeStreamingChatModel({ responses: [new AIMessage("hello")],
    callbacks: [tracker.callbacks("missing")] }).invoke("hello");
  assert.equal(events.at(-1)?.failedCalls, 1);
  assert.equal(events.at(-1)?.unmeasuredCalls, 2);
  assert.equal(events.at(-1)?.measuredCalls, 0);
});

test("separate requests are isolated and logging failure cannot break output", async () => {
  const ids: unknown[] = [];
  await Promise.all([1, 2].map(async () => {
    const tracker = createAiUsageTracker("recommendation", e => { ids.push(e.requestId); throw Error("log unavailable"); });
    const result = await new FakeStreamingChatModel({ responses: [new AIMessage("ok")],
      callbacks: [tracker.callbacks("model")] }).invoke("hello");
    assert.equal(result.content, "ok");
  }));
  assert.equal(new Set(ids).size, 2);
});
