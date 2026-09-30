import fs from "node:fs/promises";
import path from "node:path";

const files = [
  {
    name: "daegu-food-guide-2026.pdf",
    url: "https://www.daegufood.go.kr/common/asp/lib/downFile.asp?bCode=board&d=6&folder=pds&bid=99&Fidx=6445",
  },
  {
    name: "daegu-tourism-db-guide.pdf",
    url: "https://tour.daegu.go.kr/file/d23e2a2b167e4ce6b10b3f8f31ffefec.pdf",
  },
  {
    name: "daegu-subway-trip-guide.pdf",
    url: "https://tour.daegu.go.kr/file/7999575debef43ea8705141c1a7f7154.pdf",
  },
];

const outputDir = path.join(process.cwd(), "data", "rag");
await fs.mkdir(outputDir, { recursive: true });

for (const file of files) {
  const response = await fetch(file.url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${file.name} 다운로드 실패: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.subarray(0, 4).equals(Buffer.from("%PDF"))) throw new Error(`${file.name}은 PDF 응답이 아닙니다.`);
  await fs.writeFile(path.join(outputDir, file.name), bytes);
  console.log(`${file.name}: ${(bytes.length / 1024 / 1024).toFixed(1)}MB`);
}
