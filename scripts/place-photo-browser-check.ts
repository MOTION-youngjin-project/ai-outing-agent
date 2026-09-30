import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

const bundle = await build({ stdin: { contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {PlacePhoto} from './src/components/PlacePhoto';
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}>
<PlacePhoto placeId="ok" name="박물관"/><PlacePhoto placeId="broken" name="깨진 사진"/>
<PlacePhoto placeId="missing" name="없는 사진"/></QueryClientProvider>);
`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, jsx: "automatic", platform: "browser", define: { "process.env.NODE_ENV": '"test"' } });
const server = createServer((req, res) => {
  res.setHeader("Content-Type", req.url === "/bundle.js" ? "text/javascript" : "text/html; charset=utf-8");
  res.end(req.url === "/bundle.js" ? bundle.outputFiles[0].text : '<div id="root"></div><script src="/bundle.js"></script>');
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/places/*/photo", async route => {
    const id = route.request().url().split("/").at(-2);
    await route.fulfill({ json: { photo: id === "missing" ? null : { url: `https://upload.wikimedia.org/${id}.png`, title: "Museum", author: "Photographer",
      credit: "Own work", sourceUrl: "https://commons.wikimedia.org/wiki/File:Museum.jpg", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", capturedAt: "2025-01-01" } } });
  });
  await page.route("https://upload.wikimedia.org/*", async route => {
    if (route.request().url().includes("broken")) return route.fulfill({ status: 404, body: "" });
    await route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1sAAAAASUVORK5CYII=", "base64") });
  });
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page.getByAltText("박물관 — Museum").waitFor();
  await page.waitForFunction(() => [...document.images].some(img => img.alt.startsWith("박물관") && img.naturalWidth > 0));
  await page.getByRole("img", { name: "깨진 사진: 이용 가능한 사진 없음" }).waitFor();
  await page.getByRole("img", { name: "없는 사진: 이용 가능한 사진 없음" }).waitFor();
  await page.getByText("사진 출처·이용 조건").click();
  assert.equal(await page.getByRole("link", { name: "Wikimedia Commons 원본" }).getAttribute("href"), "https://commons.wikimedia.org/wiki/File:Museum.jpg");
  assert.ok(await page.getByText("촬영일(출처 기재): 2025-01-01").isVisible());
  assert.deepEqual(errors, []);
  console.log("Browser check passed: image display, missing/broken fallback, attribution links, capture date.");
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
