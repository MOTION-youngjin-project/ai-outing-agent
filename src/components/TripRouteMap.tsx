"use client";

import { NaverMap } from "./NaverMap";
import type { ParkingLocation, TripStop } from "@/lib/active-trip";
import type { Point } from "@/lib/trip-replan";

export function TripRouteMap({ stops, parking, origin, mapKey }: { stops: TripStop[]; parking: ParkingLocation; origin?: Point; mapKey: string }) {
  const remaining = stops.filter((s) => !s.visitedAt && s.latitude !== null && s.longitude !== null);
  const spots = [...remaining.map((s, i) => ({ id: s.id, name: s.name, latitude: s.latitude!, longitude: s.longitude!, walkMinutes: null, order: i + 1 })), { id: "parking-return", name: `주차장 복귀 · ${parking.label}`, latitude: parking.latitude, longitude: parking.longitude, walkMinutes: null, order: remaining.length + 1 }];
  return <div className="mt-3 space-y-2" aria-label="진행 코스 지도">
    <NaverMap key={mapKey} center={origin ?? parking} spots={spots} origin={origin} />
    <p className="text-xs">지도 번호는 아래 방문 순서입니다. 실제 도로 경로선은 표시하지 않습니다.{origin ? " 파란 점은 재추천 당시 출발 위치입니다." : ""}</p>
    <ol className="text-sm">{spots.map((s) => <li key={s.id}>{s.order}. {s.name}</li>)}</ol>
  </div>;
}
