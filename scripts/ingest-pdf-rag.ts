import "../load-env";
import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { prisma } from "../src/lib/prisma";

type Manifest = {
  documents: Array<{ key: string; title: string; url: string; type: string; checksum: string; filename: string; pageCount: number }>;
  chunks: Array<{ documentKey: string; page: number; part: number; text: string }>;
};

const manifest = JSON.parse(await fs.readFile(path.join(process.cwd(), "data/rag/chunks.json"), "utf8")) as Manifest;
const source = await prisma.dataSource.upsert({
  where: { code: "RAG_PDF" },
  update: { enabled: true },
  create: { code: "RAG_PDF", name: "대구 공식 관광 PDF", sourceType: "pdf_rag" },
});
const embeddings = process.env.GEMINI_API_KEY ? new GoogleGenerativeAIEmbeddings({ model: "gemini-embedding-001", apiKey: process.env.GEMINI_API_KEY }) : null;

for (const documentMeta of manifest.documents) {
  const chunks = manifest.chunks.filter((chunk) => chunk.documentKey === documentMeta.key);
  if (!chunks.length) {
    console.warn(`${documentMeta.title}: 추출 가능한 텍스트가 없어 건너뜀`);
    continue;
  }
  const document = await prisma.ragDocument.upsert({
    where: { sourceId_externalKey: { sourceId: source.id, externalKey: documentMeta.key } },
    update: { title: documentMeta.title, sourceUrl: documentMeta.url, documentType: documentMeta.type, checksum: documentMeta.checksum, metadataJson: { filename: documentMeta.filename, pageCount: documentMeta.pageCount }, indexedAt: new Date(), isActive: true },
    create: { sourceId: source.id, externalKey: documentMeta.key, title: documentMeta.title, sourceUrl: documentMeta.url, documentType: documentMeta.type, checksum: documentMeta.checksum, metadataJson: { filename: documentMeta.filename, pageCount: documentMeta.pageCount } },
  });
  const vectors: number[][] = [];
  for (let offset = 0; embeddings && offset < chunks.length; offset += 50) {
    vectors.push(...await embeddings.embedDocuments(chunks.slice(offset, offset + 50).map((chunk) => chunk.text)));
    console.log(`${documentMeta.title}: ${Math.min(offset + 50, chunks.length)}/${chunks.length} 임베딩`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.ragChunk.deleteMany({ where: { documentId: document.id } });
    await tx.ragChunk.createMany({ data: chunks.map((chunk, index) => ({
      documentId: document.id, chunkIndex: index, content: chunk.text, embedding: vectors[index],
      tokenCount: Math.ceil(chunk.text.length / 3), metadataJson: { page: chunk.page, part: chunk.part },
    })) });
  });
}

console.log(`PDF RAG 색인 완료: 문서 ${manifest.documents.length}개, 청크 ${manifest.chunks.length}개`);
await prisma.$disconnect();
