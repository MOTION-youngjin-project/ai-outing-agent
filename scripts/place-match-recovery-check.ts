import assert from "node:assert/strict";
import { pickBestPlaceMatch, pickConfidentPlaceMatch, rankPlaceMatches } from "../src/lib/services/matching";

const document = (id: string, name: string, address: string, x: string, y: string) => ({
  id, place_name: name, road_address_name: address, address_name: address, x, y,
});

const renamed = [
  document("1", "안심창조밸리 연꽃단지", "대구 동구 금강동", "128.737", "35.868"),
  document("2", "연꽃카페", "대구 수성구", "128.630", "35.850"),
];
assert.equal(pickBestPlaceMatch("안심연꽃단지", renamed), undefined, "기존 이름 포함 규칙으로는 공식 명칭 변형을 복구하지 못해야 함");
assert.equal(
  pickConfidentPlaceMatch("안심연꽃단지", renamed, { district: "동구" })?.id,
  "1",
  "이름 조각과 주소 구/군을 함께 비교해 공식 명칭을 찾아야 함",
);

const sameName = [
  document("near", "연꽃단지", "대구 동구", "128.735", "35.870"),
  document("far", "연꽃단지", "대구 동구", "128.400", "35.500"),
];
assert.equal(
  rankPlaceMatches("연꽃단지", sameName, { district: "동구", reference: { latitude: 35.87, longitude: 128.73 } })[0].document.id,
  "near",
  "이름과 주소가 같으면 기준 좌표에서 가까운 후보가 먼저여야 함",
);
assert.equal(
  pickConfidentPlaceMatch("연꽃단지", sameName, { district: "동구" }),
  undefined,
  "구분 근거 없는 동점 후보는 자동 선택하지 않아야 함",
);
console.log("장소 복구 매칭: 공식 명칭 변형·주소·좌표·복수 후보 검사 통과");
