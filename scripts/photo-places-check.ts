import test from "node:test";
import assert from "node:assert/strict";
import { PHOTO_PLACES } from "../src/lib/data/daegu-photo-places";
import { GET } from "../src/app/api/photo-places/route";

test("장소 식별자·좌표·출처·실내 촬영 조건 확인", () => {
  assert.equal(new Set(PHOTO_PLACES.map((p) => p.id)).size, PHOTO_PLACES.length);
  for (const p of PHOTO_PLACES) {
    assert.ok(p.sources.some((s) => s.fields.includes("location")));
    assert.equal(p.coordinateUse, "venue-reference");
    if (p.environment === "indoor") assert.equal(p.indoorPhotoPermission, "check-on-site");
  }
});
test("실내 필터는 카페가 부속된 야외 장소를 포함하지 않음", async () => {
  const response = await GET(new Request("http://localhost/api/photo-places?environment=indoor"));
  const data = await response.json();
  assert.deepEqual(data.places.map((p: { name: string }) => p.name), ["대구미술관", "대구예술발전소"]);
});
test("태그와 환경은 교집합이며 결과 없음을 허용", async () => {
  const response = await GET(new Request("http://localhost/api/photo-places?tag=" + encodeURIComponent("노을") + "&environment=indoor"));
  assert.deepEqual((await response.json()).places, []);
  const outdoor = await GET(new Request("http://localhost/api/photo-places?tag=" + encodeURIComponent("노을")));
  assert.equal((await outdoor.json()).places[0].id, "photo:suseongmot");
});
test("알 수 없는 조건·중복 조건은 무시하지 않고 거부", async () => {
  for (const query of ["tag=unknown", "environment=mixed", "extra=1", "tag=야경&tag=노을", "environment="]) {
    assert.equal((await GET(new Request(`http://localhost/api/photo-places?${query}`))).status, 400);
  }
});
test("조회 시 현재 영업 중이라는 확정값을 만들지 않음", async () => {
  const response = await GET(new Request("http://localhost/api/photo-places"));
  const data = await response.json();
  assert.equal(data.places.length, 6);
  assert.ok(data.notice.includes("방문일"));
  assert.equal(data.places.some((p: object) => "isOpen" in p), false);
});
