// Explicit opt-in: this makes one paid-provider model attempt; never touches app DB/billing.
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { runAgentOnce } from "../src/lib/agent";

if (process.env.RUN_LIVE_TOKEN_CHECK !== "1") throw Error("Set RUN_LIVE_TOKEN_CHECK=1 to run a real provider request.");
if (process.env.TOKEN_CHECK_ENV_FILE) {
  const values = parse(readFileSync(process.env.TOKEN_CHECK_ENV_FILE));
  process.env.GEMINI_API_KEY = values.GEMINI_API_KEY;
}
if (!process.env.GEMINI_API_KEY) throw Error("GEMINI_API_KEY required");
try {
  // Missing region must ask a question, without weather/PDF/place lookups.
  const result = await runAgentOnce("gemini-3.5-flash-lite", [{ role: "user", content: "나들이 지역을 아직 정하지 않았어요. 어느 지역인지 먼저 물어봐 주세요." }]);
  if (!result.needsMoreInfo) throw Error("Expected a clarification response");
  console.log("Live clarification check passed. Inspect [ai-usage] for provider-reported counts.");
} catch (error) {
  // Avoid dumping provider requests, URLs or credentials.
  const message = error instanceof Error ? error.message : "";
  console.error("Live check failed:", /429/.test(message) ? "rate limit" : /404/.test(message) ? "model unavailable" : /401|403|API key/.test(message) ? "credentials/access" : "provider or response error");
  process.exitCode = 1;
}
