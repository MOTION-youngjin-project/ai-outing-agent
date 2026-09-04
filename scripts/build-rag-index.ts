// 문서 임베딩을 1회 계산해서 src/lib/rag/index.json에 캐싱한다.
// 문서(documents.ts)를 바꿀 때만 다시 실행하면 된다: node --experimental-strip-types --env-file=.env.local scripts/build-rag-index.ts
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { facilityDocs } from "../src/lib/rag/documents";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const embeddings = new GoogleGenerativeAIEmbeddings({
    model: "gemini-embedding-001",
    apiKey: process.env.GEMINI_API_KEY,
  });

  const vectors = await embeddings.embedDocuments(facilityDocs.map((d) => d.text));
  const indexed = facilityDocs.map((doc, i) => ({ ...doc, embedding: vectors[i] }));

  const outPath = path.join(__dirname, "..", "src", "lib", "rag", "index.json");
  writeFileSync(outPath, JSON.stringify(indexed));
  console.log(`${indexed.length}건 임베딩 완료 -> ${outPath}`);
}

main();
