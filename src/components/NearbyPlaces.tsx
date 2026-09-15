"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NEARBY_LABELS, isFoodCategory, nearbyKindsForCategory, type NearbyKind, type NearbyPlace } from "@/lib/nearby";
import { coordinate } from "@/lib/coordinates";

export function NearbyPlaces({ name, category, latitude, longitude, exclude }: {
  name: string; category?: string | null; latitude?: number | null; longitude?: number | null; exclude: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const foodMain = isFoodCategory(category);
  const availableKinds = nearbyKindsForCategory(category);
  const [kind, setKind] = useState<NearbyKind>(foodMain ? "walk" : "food");
  const [radius, setRadius] = useState("1000");
  const point = coordinate(latitude, longitude);
  const query = useQuery({
    queryKey: ["nearby-places", latitude, longitude, kind, radius],
    enabled: expanded && !!point,
    staleTime: 30 * 60 * 1000, retry: false,
    queryFn: async (): Promise<NearbyPlace[]> => {
      const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), kind, radius });
      const response = await fetch(`/api/nearby-places?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "주변 장소 조회에 실패했습니다.");
      return body.data;
    },
  });
  const normalize = (value: string) => value.replace(/\s/g, "").toLowerCase();
  const places = (query.data ?? []).filter(p => !exclude.some(n => normalize(n) === normalize(p.name)));
  return (
    <section className="rounded-2xl border border-hairline bg-white p-3">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="w-full text-left text-[13px] font-semibold text-accent">
        {foodMain ? "식사 후 주변에서 무엇을 할까요?" : `${name} 주변 서브 장소`} {expanded ? "접기" : "보기"}
      </button>
      {expanded && (!point ? <p className="mt-2 text-[12px] text-muted">위치가 확인되지 않아 주변 장소를 찾을 수 없습니다.</p> : <>
        <div className="my-3 flex flex-wrap gap-2">
          {availableKinds.map(value => <button type="button" key={value} aria-pressed={kind === value} onClick={() => setKind(value)} className={`rounded-full border px-3 py-1 text-[12px] ${kind === value ? "border-accent bg-mint-bg text-accent" : "border-hairline text-muted"}`}>{foodMain && value === "walk" ? "식사 후 산책" : value === "cafe" && foodMain ? "근처 카페" : NEARBY_LABELS[value]}</button>)}
          {foodMain && <button type="button" onClick={() => setExpanded(false)} className="rounded-full border border-hairline px-3 py-1 text-[12px] text-muted">바로 귀가</button>}
          <select aria-label="주변 검색 반경" value={radius} onChange={e => setRadius(e.target.value)} className="rounded-lg border border-hairline px-2 text-[12px]"><option value="1000">1km 이내</option><option value="3000">3km 이내</option></select>
        </div>
        {query.isFetching && <p role="status" className="text-[12px] text-muted">주변 장소를 찾고 있습니다.</p>}
        {query.isError && <div role="alert" className="text-[12px] text-muted">{query.error.message} <button type="button" onClick={() => query.refetch()} className="text-accent underline">다시 시도</button></div>}
        {!query.isFetching && !query.isError && places.length === 0 && <p className="text-[12px] text-muted">조건에 맞는 장소가 없습니다. 종류나 검색 반경을 바꿔보세요.</p>}
        <ul className="space-y-2">{places.map(p => <li key={p.id} className="rounded-xl bg-mint-bg p-3">
          <a href={p.mapUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold text-ink">{p.name} · 지도 보기 ↗</a>
          <p className="mt-1 text-[12px] text-muted">직선거리 {p.distanceM < 1000 ? `${p.distanceM}m` : `${(p.distanceM / 1000).toFixed(1)}km`} · 도보 약 {p.estimatedWalkMinutes}분 · {p.address}</p>
          <p className="mt-1 text-[11px] text-muted">운영시간은 지도에서 확인 후 방문하세요.</p>
        </li>)}</ul>
        <p className="mt-3 text-[11px] text-muted">카카오맵 검색 결과입니다. 영업 여부·운영시간은 방문 전에 확인해 주세요. 서브 장소는 시간표에 자동 추가되지 않습니다.</p>
      </>)}
    </section>
  );
}
