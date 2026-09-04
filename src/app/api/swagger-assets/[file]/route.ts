import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const ASSETS = {
  "swagger-ui.css": { contentType: "text/css; charset=utf-8" },
  "swagger-ui-bundle.js": { contentType: "text/javascript; charset=utf-8" },
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  const asset = ASSETS[file as keyof typeof ASSETS];
  if (!asset) return new Response("Not found", { status: 404 });

  const filePath = path.join(process.cwd(), "node_modules", "swagger-ui-dist", file);
  const body = await fs.readFile(filePath);
  return new Response(body, {
    headers: {
      "Content-Type": asset.contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
