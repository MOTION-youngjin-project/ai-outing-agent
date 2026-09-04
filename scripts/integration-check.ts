import assert from "node:assert/strict";

const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

async function json(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json();
  assert.equal(response.ok, true, `${path}: HTTP ${response.status} ${JSON.stringify(body)}`);
  return body;
}

const sources = await json("/api/data-sources");
assert.equal(sources.count, 6, "data_sources는 6건이어야 합니다.");

const regions = await json("/api/regions");
assert.equal(regions.count, 10, "regions는 10건이어야 합니다.");

const detail = await json("/api/regions/1");
assert.equal(detail.data.name, "대구광역시");
assert.equal(detail.data.children.length, 9);

const weather = await json("/api/weather?regionId=1");
assert.ok(["hit", "miss"].includes(weather.data.cache));

const places = await json(`/api/places?query=${encodeURIComponent("대구미술관")}`);
assert.ok(places.count > 0, "네이버 장소 검색 결과가 비어 있습니다.");

const openapi = await json("/api/openapi");
assert.equal(openapi.openapi, "3.1.0");

console.log("✓ integration-check 통과 (6개 API 흐름)");
