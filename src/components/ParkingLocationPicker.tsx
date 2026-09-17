"use client";

import { useEffect, useRef, useState } from "react";
import { loadNaverMapsSdk } from "./NaverMap";
import { parkingLocationSchema, type ParkingLocation, type ActiveTrip } from "@/lib/active-trip";
import { useActiveTrip } from "@/lib/active-trip-store";

type Point = { latitude: number; longitude: number };
type MapInstance = InstanceType<Window["naver"]["maps"]["Map"]>;
const button = "rounded-lg border border-accent/30 px-3 py-2 text-sm disabled:opacity-50";

function ParkingEditor({ trip, onClose }: { trip: ActiveTrip; onClose: () => void }) {
  const setParking = useActiveTrip((s) => s.setParking);
  const [label, setLabel] = useState(trip.parking?.label ?? "내 주차 위치");
  const [draft, setDraft] = useState<ParkingLocation | null>(trip.parking ?? null);
  const [confirmed, setConfirmed] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [mapError, setMapError] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance | null>(null);
  const alive = useRef(false);
  const gpsRequest = useRef(0);
  const initial = useRef<Point>(trip.parking ?? trip.stops.find((s) => s.latitude !== null && s.longitude !== null) as Point | undefined ?? { latitude: 35.8714, longitude: 128.6014 });

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    const key = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
    Promise.resolve().then(async () => {
      if (!key) throw new Error("지도 연결이 준비되지 않았습니다. 현재 위치로 저장하거나 나중에 다시 시도해 주세요.");
      await loadNaverMapsSdk(key);
      if (cancelled || !container.current) return;
      const maps = window.naver.maps;
      map.current = new maps.Map(container.current, { center: new maps.LatLng(initial.current.latitude, initial.current.longitude), zoom: 17 });
      setMapReady(true);
    }).catch(() => {
      if (!cancelled) setMapError("지도를 불러오지 못했습니다. 현재 위치로 저장하거나 지도 연결을 다시 시도해 주세요.");
    });
    return () => { cancelled = true; map.current?.destroy(); map.current = null; };
  }, [attempt]);

  function select(point: Point, source: "gps" | "map", accuracyM: number | null) {
    const result = parkingLocationSchema.safeParse({ ...point, label: "내 주차 위치", source, accuracyM, savedAt: new Date().toISOString() });
    if (!result.success) { setError("유효한 위치를 얻지 못했습니다. 다시 선택해 주세요."); return; }
    setDraft(result.data); setConfirmed(false); setError("");
    initial.current = point;
  }

  function locate() {
    if (locating) return;
    if (!navigator.geolocation) { setError("현재 위치를 지원하지 않습니다. 지도에서 선택해 주세요."); return; }
    const request = ++gpsRequest.current;
    setLocating(true); setConfirmed(false); setError("");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (!alive.current || request !== gpsRequest.current) return;
      setLocating(false);
      const point = { latitude: coords.latitude, longitude: coords.longitude };
      select(point, "gps", Number.isFinite(coords.accuracy) ? coords.accuracy : null);
      map.current?.panTo(new window.naver.maps.LatLng(point.latitude, point.longitude));
    }, (reason) => {
      if (!alive.current || request !== gpsRequest.current) return;
      setLocating(false);
      setError(reason.code === 1 ? "위치 권한이 거부되었습니다. 지도에서 직접 선택하거나 브라우저 설정에서 권한을 허용해 주세요." : reason.code === 3 ? "위치 조회 시간이 초과되었습니다. 다시 시도하거나 지도에서 선택해 주세요." : "현재 위치를 확인하지 못했습니다. 지도에서 직접 선택해 주세요.");
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }

  return <div className="mt-3 space-y-3 rounded-xl border p-3" aria-label="주차 위치 편집">
    <p className="text-sm">지도 중앙의 +를 주차한 곳에 맞춘 뒤 ‘지도 중앙 선택’을 누르세요. 선택 위치를 확인해야 저장됩니다.</p>
    <button type="button" className={button} disabled={locating} onClick={locate}>{locating ? "현재 위치 확인 중…" : "현재 위치 가져오기"}</button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="relative h-64 overflow-hidden rounded-lg bg-gray-100" aria-label="주차 위치 선택 지도">
      <div ref={container} className="h-full w-full" />
      {mapReady && <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-4xl font-bold text-red-600">+</span>}
      {!mapReady && <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm">{mapError || "지도 연결 중…"}</p>}
    </div>
    {mapError && <button type="button" className={button} onClick={() => { setMapError(""); setMapReady(false); setAttempt((n) => n + 1); }}>지도 다시 시도</button>}
    <button type="button" className={button} disabled={!mapReady || locating} onClick={() => {
      const center = map.current?.getCenter();
      if (center) select({ latitude: center.lat(), longitude: center.lng() }, "map", null);
    }}>지도 중앙 선택</button>
    <label className="block text-sm">주차 위치 이름<input className="mt-1 w-full rounded border p-2" maxLength={100} value={label} onChange={(e) => setLabel(e.target.value)} /></label>
    {draft && <div className="space-y-2 text-sm">
      <p>선택 위치: {draft.latitude.toFixed(6)}, {draft.longitude.toFixed(6)} ({draft.source === "gps" ? "현재 위치" : "지도 선택"})</p>
      {draft.accuracyM !== null && <p>위치 정확도: 약 {Math.round(draft.accuracyM)}m. 부정확하면 지도에서 보정해 주세요.</p>}
      <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />선택한 위치가 주차한 곳인지 확인했습니다.</label>
    </div>}
    <div className="flex gap-2">
      <button type="button" className={button} disabled={!draft || !confirmed || !label.trim() || locating} onClick={() => {
        if (draft && setParking(trip.id, { ...draft, label: label.trim(), savedAt: new Date().toISOString() })) onClose();
        else setError("주차 위치를 저장하지 못했습니다. 여행 상태와 기기 저장 공간을 확인해 주세요.");
      }}>주차 위치 저장</button>
      <button type="button" className={button} onClick={onClose}>취소</button>
    </div>
  </div>;
}

export function ParkingLocationPicker({ trip }: { trip: ActiveTrip }) {
  const [editing, setEditing] = useState(false);
  const setParking = useActiveTrip((s) => s.setParking);
  return <section aria-label="저장된 주차 위치" className="mt-3 border-t pt-3">
    <h3 className="text-sm font-semibold">내 주차 위치</h3>
    {trip.parking ? <div className="my-2 text-sm"><p>{trip.parking.label}</p><p>{trip.parking.latitude.toFixed(6)}, {trip.parking.longitude.toFixed(6)}</p><p className="text-xs">저장: {new Date(trip.parking.savedAt).toLocaleString("ko-KR")}</p></div> : <p className="my-2 text-sm">저장된 주차 위치가 없습니다.</p>}
    <p className="mb-2 text-xs text-muted">주차 위치 1곳을 이 기기에 저장합니다. 아래에서 수정하거나 삭제할 수 있습니다.</p>
    {trip.status === "active" && !editing && <div className="flex gap-2">
      <button type="button" className={button} onClick={() => setEditing(true)}>{trip.parking ? "주차 위치 수정" : "여기에 주차했어요"}</button>
      {trip.parking && <button type="button" className={button} onClick={() => { if (window.confirm("저장된 주차 위치를 삭제할까요?")) setParking(trip.id, null); }}>주차 위치 삭제</button>}
    </div>}
    {editing && trip.status === "active" && <ParkingEditor trip={trip} onClose={() => setEditing(false)} />}
  </section>;
}
