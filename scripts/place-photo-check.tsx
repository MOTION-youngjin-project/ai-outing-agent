import assert from "node:assert/strict";
import { test, mock } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PlacePhoto } from "../src/components/PlacePhoto";
import { licensedPhoto, matchedPhotoFile, getLicensedPlacePhoto } from "../src/lib/services/place-photo";
import { newestPhoto, photoCaptureDate } from "../src/lib/place-photo";
import { approvedPlacePhotos } from "../src/lib/approved-place-photos";
Object.assign(globalThis, { React });
const metadata = { thumburl: "https://thumb.wikimedia.org/photo.jpg", extmetadata: {
  Artist: { value: '<a href="javascript:bad">Author</a>' }, Credit: { value: "Own work" },
  LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/3.0" }, CommonsMetadataExtension: { value: 1.2 },
} };
test("supported license, new Commons thumbnail host and numeric metadata retain plain attribution", () => {
  const photo = licensedPhoto(metadata, "Museum.jpg");
  assert.ok(photo);
  assert.equal(photo.author, "Author");
  assert.equal(photo.license, "CC BY-SA 3.0");
  assert.ok(!JSON.stringify(photo).includes("javascript:"));
});
test("unknown license, noncommercial, restricted, unsafe URL and absent author fail closed", () => {
  for (const url of ["https://creativecommons.org/licenses/by-nc/4.0/", "https://example.com/", "javascript:bad"])
    assert.equal(licensedPhoto({ ...metadata, extmetadata: { ...metadata.extmetadata, LicenseUrl: { value: url } } }, "x.jpg"), null);
  assert.equal(licensedPhoto({ ...metadata, thumburl: "https://evil.example/image.jpg" }, "x.jpg"), null);
  assert.equal(licensedPhoto({ ...metadata, extmetadata: { ...metadata.extmetadata, Artist: { value: "" } } }, "x.jpg"), null);
  assert.equal(licensedPhoto({ ...metadata, extmetadata: { ...metadata.extmetadata, Restrictions: { value: "personality rights" } } }, "x.jpg"), null);
});
test("same name and nearby Earth coordinate required, ambiguous name alone is insufficient", () => {
  const entity = { labels: { ko: { value: "박물관" } }, claims: {
    P625: [{ mainsnak: { datavalue: { value: { latitude: 35, longitude: 128, globe: "http://www.wikidata.org/entity/Q2" } } } }],
    P18: [{ mainsnak: { datavalue: { value: "Museum.jpg" } } }],
  } };
  assert.equal(matchedPhotoFile(entity, { name: "박물관", latitude: 35, longitude: 128 }), "Museum.jpg");
  assert.equal(matchedPhotoFile(entity, { name: "다른 박물관", latitude: 35, longitude: 128 }), null);
  assert.equal(matchedPhotoFile(entity, { name: "박물관", latitude: 36, longitude: 128 }), null);
  assert.equal(matchedPhotoFile({ labels: entity.labels }, { name: "박물관", latitude: 35, longitude: 128 }), null);
});
test("provider failure yields cached null and concurrent requests share lookup", async () => {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => { calls++; throw Error("offline"); };
  try {
    const point = { name: "test missing", latitude: 35, longitude: 128 };
    assert.deepEqual(await Promise.all([getLicensedPlacePhoto(point), getLicensedPlacePhoto(point)]), [null, null]);
    assert.equal(await getLicensedPlacePhoto(point), null);
    assert.equal(calls, 2); // Two independent source lookups, shared by both requests.
  } finally { globalThis.fetch = original; }
});
test("prefer shooting date across sources, never upload dates or invalid/future dates", () => {
  const photo = licensedPhoto(metadata, "Museum.jpg")!;
  assert.equal(photoCaptureDate("2024-02-30"), null);
  assert.equal(photoCaptureDate("2099-01-01"), null);
  assert.equal(photoCaptureDate("circa 2024"), null);
  assert.equal(photoCaptureDate("2024-06-01 12:34:56"), "2024-06-01");
  const old = { ...photo, capturedAt: "2015-01-01" };
  const recent = { ...photo, capturedAt: "2025-06-01", source: "official" as const };
  assert.equal(newestPhoto([photo, old, recent]), recent);
  const uploadOnly = licensedPhoto({ ...metadata, extmetadata: { ...metadata.extmetadata, DateTime: { value: "2025-06-01" } } }, "x.jpg");
  assert.equal(uploadOnly?.capturedAt, null);
});
test("registered photos require reviewed permission and exact place id", () => {
  const photo = licensedPhoto(metadata, "Museum.jpg")!;
  const entry = { ...photo, placeId: "place", reviewedAt: "2025-01-01T00:00:00Z", permissionEvidence: "https://example.com/permission",
    source: "owner", capturedAt: "2024-01-01", consentConfirmed: true };
  assert.equal(approvedPlacePhotos("place", [entry]).length, 1);
  assert.equal(approvedPlacePhotos("another", [entry]).length, 0);
  assert.equal(approvedPlacePhotos("place", [{ ...entry, consentConfirmed: false }]).length, 0);
  assert.equal(approvedPlacePhotos("place", [{ ...entry, permissionEvidence: undefined }]).length, 0);
});
test("component exposes image and attribution links; missing image keeps placeholder", () => {
  const client = new QueryClient();
  const photo = licensedPhoto(metadata, "Museum.jpg")!;
  client.setQueryData(["licensed-place-photo", "place"], photo);
  const html = renderToStaticMarkup(<QueryClientProvider client={client}><PlacePhoto placeId="place" name="박물관" /></QueryClientProvider>);
  assert.ok(html.includes(photo.url));
  assert.ok(html.includes(photo.sourceUrl));
  assert.ok(html.includes(photo.licenseUrl));
  assert.ok(html.includes("Author"));
  assert.ok(!html.includes("object-cover"));
  const empty = renderToStaticMarkup(<QueryClientProvider client={client}><PlacePhoto name="없음" /></QueryClientProvider>);
  assert.ok(empty.includes("이용 가능한 사진 없음"));
  client.clear();
});
test("API authenticates and uses stored location instead of caller coordinates", async () => {
  let authenticated = false;
  let dbCalls = 0;
  mock.module("../src/lib/auth", { namedExports: { auth: async () => authenticated ? { user: { id: "1" } } : null } });
  mock.module("../src/lib/prisma", { namedExports: { prisma: { place: { findUnique: async () => { dbCalls++; return null; } } } } });
  const { GET } = await import("../src/app/api/places/[placeId]/photo/route");
  const { NextRequest } = await import("next/server");
  const request = new NextRequest("http://localhost/api/places/missing/photo");
  assert.equal((await GET(request, { params: Promise.resolve({ placeId: "missing" }) })).status, 401);
  assert.equal(dbCalls, 0);
  authenticated = true;
  assert.equal((await GET(request, { params: Promise.resolve({ placeId: "missing" }) })).status, 404);
  assert.equal((await GET(request, { params: Promise.resolve({ placeId: "../bad" }) })).status, 400);
  assert.equal(dbCalls, 1);
});
