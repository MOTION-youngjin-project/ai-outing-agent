import "../load-env";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";

// data/rag/*.pdf → data/rag/chunks.json. 여기서 뽑은 청크를 ingest-pdf-rag.ts가 임베딩해서
// rag_chunks에 넣고, 에이전트의 search_daegu_pdf_guides 도구가 그걸 검색한다.
const PDF_DIR = path.join(process.cwd(), "data", "rag");
const OUTPUT = path.join(PDF_DIR, "chunks.json");

const DOCUMENTS = [
  {
    filename: "daegu-food-guide-2026.pdf",
    key: "daegu-food-guide-2026",
    title: "2026 대구음식점 가이드북",
    url: "https://www.daegufood.go.kr/kor/board/board.asp?board_id=6&idx=99&mode=cont",
    type: "food_guide",
  },
  {
    filename: "daegu-tourism-db-guide.pdf",
    key: "daegu-tourism-db-guide",
    title: "대구관광 DB자료집",
    url: "https://tour.daegu.go.kr/index.do?menu_id=00002956",
    type: "tourism_database_guide",
  },
  {
    filename: "daegu-subway-trip-guide.pdf",
    key: "daegu-subway-trip-guide",
    title: "도시철도로 떠나는 대구 여행",
    url: "https://tour.daegu.go.kr/file/7999575debef43ea8705141c1a7f7154.pdf",
    type: "route_guide",
  },
];

function normalize(text: string) {
  return text
    .replace(/\x00/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// 한 페이지가 1400자를 넘으면 임베딩 품질이 떨어져서 자른다. 문장/줄 경계에서 끊고,
// 경계를 넘나드는 문맥이 잘리지 않도록 180자씩 겹쳐 둔다.
function splitText(text: string, maxChars = 1400, overlap = 180) {
  if (text.length <= maxChars) return text ? [text] : [];
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf("\n", end), text.lastIndexOf(". ", end));
      if (boundary > start + maxChars / 2) end = boundary + 1;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) parts.push(chunk);
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return parts;
}

const result: {
  documents: (Omit<(typeof DOCUMENTS)[number], never> & { checksum: string; pageCount: number })[];
  chunks: { documentKey: string; page: number; part: number; text: string }[];
} = { documents: [], chunks: [] };

for (const meta of DOCUMENTS) {
  const file = path.join(PDF_DIR, meta.filename);
  const bytes = await fs.readFile(file).catch(() => null);
  if (!bytes) {
    console.error(`missing: ${file}`);
    continue;
  }

  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  // mergePages: false → 페이지별 텍스트. 출처를 "PDF p.12"로 표시해야 해서 페이지 단위가 필요하다.
  const { totalPages, text: pages } = await extractText(pdf, { mergePages: false });

  result.documents.push({
    ...meta,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    pageCount: totalPages,
  });

  let extracted = 0;
  pages.forEach((raw, index) => {
    const text = normalize(raw ?? "");
    // 사진만 있는 페이지(추출 텍스트 20자 미만)는 검색에 방해만 돼서 버린다.
    if (text.length < 20) return;
    extracted += 1;
    const page = index + 1;
    splitText(text).forEach((chunk, part) => {
      result.chunks.push({
        documentKey: meta.key,
        page,
        part,
        text: `[문서: ${meta.title} | PDF 페이지 ${page}]\n${chunk}`,
      });
    });
  });
  console.error(`${meta.filename}: ${extracted} pages extracted`);
}

await fs.writeFile(OUTPUT, JSON.stringify(result), "utf8");
console.log(JSON.stringify({ documents: result.documents.length, chunks: result.chunks.length, output: OUTPUT }));
