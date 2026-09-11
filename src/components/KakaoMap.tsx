"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { coordinate, type Coordinate } from "@/lib/coordinates";
import { loadKakaoMap, type KakaoMapInstance, type KakaoMaps } from "@/lib/kakao-map-sdk";

type Spot = Coordinate & { id: string; name: string; walkMinutes: number | null; order: number };
type Props = { center: Coordinate; destinationLabel: string; spots: Spot[]; className?: string; controlsBottom?: string; controlsAnimated?: boolean; selectedId?: string | null; onSelect?: (id: string) => void };
export function KakaoMap({ center, destinationLabel, spots, className, controlsBottom, controlsAnimated = true, selectedId, onSelect }: Props) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<KakaoMapInstance | null>(null);
  const sdk = useRef<KakaoMaps | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [selection, setSelection] = useState<string | null>(null);
  const [position, setPosition] = useState<Coordinate | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState("");
  const requestId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selected = selectedId === undefined ? selection : selectedId;
  const validSpots = useMemo(() => spots.filter(s => coordinate(s.latitude, s.longitude)), [spots]);
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? "";
  const latitude = center.latitude, longitude = center.longitude;
  useEffect(() => {
    if (!key || !coordinate(latitude, longitude)) return;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    const container = node.current;
    if (!container) return;
    loadKakaoMap(key).then(maps => {
      if (disposed) return;
      sdk.current = maps;
      const instance = new maps.Map(container, { center: new maps.LatLng(latitude, longitude), level: 5 });
      map.current = instance;
      observer = new ResizeObserver(() => { const point = instance.getCenter(); instance.relayout(); instance.setCenter(point); });
      observer.observe(container);
      setStatus("ready");
      setGeneration(g => g + 1);
    }).catch(() => { if (!disposed) setStatus("error"); });
    return () => { disposed = true; observer?.disconnect(); map.current = null; sdk.current = null; container.replaceChildren(); };
  }, [key, latitude, longitude, attempt]);
  useEffect(() => {
    const maps = sdk.current, instance = map.current;
    if (!maps || !instance || status !== "ready") return;
    const points = [{ id: "destination", name: destinationLabel, latitude, longitude, order: 0, walkMinutes: null }, ...validSpots];
    const overlays = points.map(point => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = point.order ? `P ${point.order}` : destinationLabel;
      button.className = "rounded-full border-2 border-white px-3 py-2 text-sm font-bold text-white shadow-lg";
      button.style.background = point.id === selected ? "#0f172a" : "#0f766e";
      button.setAttribute("aria-label", `${point.name} 지도에서 선택`);
      button.setAttribute("aria-pressed", String(point.id === selected));
      button.onclick = () => { if (point.order) { setSelection(point.id); onSelect?.(point.id); } };
      return new maps.CustomOverlay({ map: instance, position: new maps.LatLng(point.latitude, point.longitude), content: button, yAnchor: 1, zIndex: point.id === selected ? 4 : 2 });
    });
    const chosen = validSpots.find(s => s.id === selected);
    if (chosen) instance.panTo(new maps.LatLng(chosen.latitude, chosen.longitude));
    else { const bounds = new maps.LatLngBounds(); points.forEach(p => bounds.extend(new maps.LatLng(p.latitude, p.longitude))); instance.setBounds(bounds, 40, 40, 80, 40); }
    return () => overlays.forEach(o => o.setMap(null));
  }, [validSpots, selected, onSelect, status, latitude, longitude, destinationLabel, generation]);
  useEffect(() => {
    const maps = sdk.current, instance = map.current;
    if (!position || !maps || !instance || status !== "ready") return;
    const content = document.createElement("span"); content.textContent = "내 위치";
    content.className = "rounded-full bg-blue-700 px-2 py-1 text-xs text-white";
    const point = new maps.LatLng(position.latitude, position.longitude);
    const overlay = new maps.CustomOverlay({ map: instance, position: point, content, zIndex: 5 });
    instance.panTo(point);
    return () => overlay.setMap(null);
  }, [position, status, generation]);
  useEffect(() => () => { requestId.current++; if (timer.current) clearTimeout(timer.current); }, []);
  function locate() {
    if (locating) return;
    const id = ++requestId.current;
    const fail = (message: string) => {
      if (id !== requestId.current) return;
      requestId.current++; if (timer.current) clearTimeout(timer.current);
      setLocating(false); setPosition(null); setNotice(`${message} 장소 위치를 표시합니다.`);
      if (sdk.current) map.current?.setCenter(new sdk.current.LatLng(latitude, longitude));
    };
    if (!navigator.geolocation) return fail("현재 위치를 지원하지 않습니다.");
    setLocating(true); setNotice("");
    timer.current = setTimeout(() => fail("위치 확인 시간이 초과됐습니다."), 11000);
    try { navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (id !== requestId.current) return;
      const point = coordinate(coords.latitude, coords.longitude);
      if (!point) return fail("위치를 확인하지 못했습니다.");
      requestId.current++; if (timer.current) clearTimeout(timer.current);
      setPosition(point); setLocating(false); setNotice("내 위치를 표시했습니다.");
    }, e => fail(e.code === 1 ? "위치 권한이 거부됐습니다." : "위치를 확인하지 못했습니다."), { timeout: 10000 });
    } catch { fail("현재 위치를 사용할 수 없습니다."); }
  }
  const unavailable = !key || !coordinate(latitude, longitude);
  return <div className={className ?? "relative h-72 overflow-hidden rounded-2xl bg-slate-100"}>
    <div ref={node} className="absolute inset-0" aria-label="카카오 지도" />
    {(unavailable || status !== "ready") && <div role="status" className="absolute inset-0 grid place-content-center gap-3 bg-slate-100 p-5 text-sm text-muted"><p>{unavailable ? "지도 연결이 준비되지 않았습니다. 장소 정보를 확인해 주세요." : status === "error" ? "지도를 불러오지 못했습니다." : "지도를 불러오는 중입니다."}</p>{!unavailable && status === "error" && <button onClick={() => { setStatus("loading"); setAttempt(a => a + 1); }}>지도 다시 불러오기</button>}</div>}
    {!unavailable && status === "ready" && <div className={`absolute right-3 z-10 flex flex-col gap-2 ${controlsAnimated ? "transition-all" : ""}`} style={{ bottom: controlsBottom ?? "12px" }}>
      <button className="rounded-lg bg-white p-3 shadow" aria-label="지도 확대" onClick={() => { if (map.current) map.current.setLevel(Math.max(1, map.current.getLevel() - 1)); }}>+</button>
      <button className="rounded-lg bg-white p-3 shadow" aria-label="지도 축소" onClick={() => { if (map.current) map.current.setLevel(Math.min(14, map.current.getLevel() + 1)); }}>−</button>
      <button className="rounded-lg bg-white p-3 text-sm shadow" disabled={locating} onClick={locate}>{locating ? "위치 확인 중" : "현재 위치"}</button>
    </div>}
    {notice && <p role="status" className="absolute left-2 top-2 z-10 max-w-[75%] rounded bg-white p-2 text-xs">{notice}</p>}
  </div>;
}
