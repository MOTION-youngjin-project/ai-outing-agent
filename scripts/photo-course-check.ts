import test from "node:test";
import assert from "node:assert/strict";
import { createPhotoCourse, photoVisitWindow } from "../src/lib/services/photo-course";
import { PHOTO_PLACES } from "../src/lib/data/daegu-photo-places";
import { photoCourseRequestSchema, photoCourseSchema, tripFromPhotoCourse, validatePhotoCourseDate, type PhotoCourseRequest } from "../src/lib/photo-course";
import { restoreTrip, updateTrip } from "../src/lib/active-trip";

const now = new Date("2026-09-17T04:00:00Z"); // 13:00 KST Thursday
const input = (overrides: Partial<PhotoCourseRequest> = {}): PhotoCourseRequest => ({ title: "친구와 노을 사진 여행", date: "2026-09-17", startTime: "13:00", durationMinutes: 420, transportMode: "walk", originId: "photo:kim-gwangseok", preferences: { tags: ["인물", "노을"], focus: "background", note: "배경 선호" }, ...overrides });
const deps = { leg: async () => ({ minutes: 15, estimated: false }) };

test("방문 날짜 및 자정 넘김 검증", () => {
  for (const req of [input({ date: "2026-09-16" }), input({ date: "2028-01-01" }), input({ startTime: "23:30", durationMinutes: 60 })]) assert.throws(() => validatePhotoCourseDate(req, now));
  assert.equal(photoCourseRequestSchema.safeParse(input({ date: "2026-02-30" })).success, false);
});
test("노을 앞에 낮 촬영 배치·시간 합계·중복 없음", async () => {
  const course = await createPhotoCourse(input(), deps, now);
  assert.equal(course.stops.length, 3);
  assert.equal(course.stops.at(-1)?.place.id, "photo:suseongmot");
  assert.equal(course.stops.reduce((sum, stop) => sum + stop.travelMinutes, 0), 30);
  assert.ok(course.stops.at(-1)!.arrivalMinute < course.sunsetMinute);
  assert.ok(course.sunsetMinute > 18 * 60 && course.sunsetMinute < 19 * 60);
  assert.ok(course.totalMinutes <= 420);
  assert.equal(new Set(course.stops.map((s) => s.place.id)).size, course.stops.length);
  assert.ok(photoCourseSchema.safeParse(course).success);
});
test("자동차 복귀 시간을 합계에 포함하고 부족하면 제외", async () => {
  const request = input({ transportMode: "car", preferences: { tags: ["노을"], focus: "overall", note: "" }, startTime: "17:00", durationMinutes: 150 });
  const course = await createPhotoCourse(request, deps, now);
  assert.equal(course.returnMinutes, 15);
  assert.equal(course.endMinute, course.stops.at(-1)!.departureMinute + 15);
  await assert.rejects(createPhotoCourse({ ...request, durationMinutes: 60 }, deps, now));
});
test("월요일 실내 휴관·입장 마감·겨울 운영시간", () => {
  const museum = PHOTO_PLACES.find((p) => p.id === "photo:daegu-art-museum")!;
  assert.equal(photoVisitWindow(museum, input({ date: "2026-09-21" })), null);
  assert.equal(photoVisitWindow(museum, input({ date: "2026-12-17" }))?.close, 1080);
  assert.equal(photoVisitWindow(museum, input())?.lastEntry, 1080);
});
test("노을 시각이 지나면 노을 전용 요청 실패", async () => {
  await assert.rejects(createPhotoCourse(input({ startTime: "20:00", durationMinutes: 60, preferences: { tags: ["노을"], focus: "overall", note: "" } }), deps, now));
});
test("대중교통 실패·잘못된 출발지·유효하지 않은 이동시간 거부", async () => {
  await assert.rejects(createPhotoCourse(input({ transportMode: "public_transit", originId: "photo:ayang-railway", preferences: { tags: ["벽화"], focus: "overall", note: "" } }), { leg: async () => null }, now));
  await assert.rejects(createPhotoCourse(input({ originId: "missing" }), deps, now));
  await assert.rejects(createPhotoCourse(input({ originId: "photo:ayang-railway", preferences: { tags: ["벽화"], focus: "overall", note: "" } }), { leg: async () => ({ minutes: NaN, estimated: false }) }, now));
});
test("확정 조건·만료·시작 시각 확인과 500자 설명 복원", async () => {
  const request = input({ preferences: { tags: ["인물"], focus: "background", note: "가".repeat(500) } });
  const course = await createPhotoCourse(request, deps, now);
  const trip = tripFromPhotoCourse(course, request, now);
  assert.equal(trip.photoTaste?.note.length, 500);
  assert.deepEqual(restoreTrip(JSON.stringify(trip))?.photoTaste, request.preferences);
  assert.deepEqual(updateTrip(trip, { remainingMinutes: 100 }).photoTaste, request.preferences);
  assert.throws(() => tripFromPhotoCourse(course, { ...request, title: "수정" }, now));
  assert.throws(() => tripFromPhotoCourse(course, request, new Date(now.getTime() + 16 * 60000)));
  const future = await createPhotoCourse({ ...request, date: "2026-09-18" }, deps, now);
  assert.throws(() => tripFromPhotoCourse(future, future.input, now));
});
test("조작된 시간 합계·중복 코스 거부", async () => {
  const course = await createPhotoCourse(input(), deps, now);
  assert.equal(photoCourseSchema.safeParse({ ...course, totalMinutes: 1 }).success, false);
  assert.equal(photoCourseSchema.safeParse({ ...course, stops: [course.stops[0], course.stops[0]] }).success, false);
});
