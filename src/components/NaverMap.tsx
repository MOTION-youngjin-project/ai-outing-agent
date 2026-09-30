"use client";

import { useEffect, useRef, useState } from "react";
import { getCurrentPosition } from "@/lib/clientApi";
import { drawRoute, rampRouteOpacity, type PolylineLike } from "@/lib/mapMotion";

type NaverMapInstance = InstanceType<Window["naver"]["maps"]["Map"]>;
type NaverMarkerInstance = InstanceType<Window["naver"]["maps"]["Marker"]>;
type NaverPolylineInstance = InstanceType<Window["naver"]["maps"]["Polyline"]>;

// 네이버 지도 API v3 타입은 별도 패키지 없이(설치 안 함) 필요한 만큼만 선언.
declare global {
  interface Window {
    naver: {
      maps: {
        Map: new (
          container: HTMLElement,
          options: { center: unknown; zoom: number }
        ) => {
          fitBounds: (
            bounds: unknown,
            margin?: { top?: number; right?: number; bottom?: number; left?: number }
          ) => void;
          panTo: (latlng: unknown) => void;
          getCenter: () => { lat: () => number; lng: () => number };
          destroy: () => void;
        };
        LatLng: new (lat: number, lng: number) => unknown;
        LatLngBounds: new (sw: unknown, ne: unknown) => { extend: (latlng: unknown) => unknown };
        Point: new (x: number, y: number) => unknown;
        Marker: new (options: {
          position: unknown;
          map: unknown;
          icon: { content: string; anchor: unknown };
        }) => {
          setPosition: (latlng: unknown) => void;
          setIcon: (icon: { content: string; anchor: unknown }) => void;
          setMap: (map: unknown) => void;
        };
        Polyline: new (options: {
          map: unknown;
          path: unknown[];
          strokeColor: string;
          strokeWeight: number;
          strokeOpacity?: number;
          strokeLineCap?: string;
          strokeLineJoin?: string;
          zIndex?: number;
        }) => {
          // 지도 오버레이는 CSS로 움직일 수 없다(지도 canvas를 건드리면 좌표가 어긋난다).
          // 경로 모션은 전부 이 두 API로만 한다 — lib/mapMotion.ts 참고.
          setOptions: (options: Record<string, unknown>) => void;
          setPath: (path: unknown[]) => void;
          setMap: (map: unknown) => void;
        };
        Event: { addListener: (target: unknown, type: string, handler: () => void) => void };
      };
    };
  }
}

let sdkLoadPromise: Promise<void> | null = null;

// 스크립트 태그를 페이지당 한 번만 주입하고, 이후 호출은 같은 Promise를 재사용한다.
export function loadNaverMapsSdk(clientId: string): Promise<void> {
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    if (window.naver?.maps) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}`;
    script.async = true;
    const timer = setTimeout(() => finish(new Error("지도 연결 시간이 초과되었습니다.")), 12000);
    function finish(error?: Error) {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (error) { script.remove(); reject(error); }
      else resolve();
    }
    script.onload = () => finish(window.naver?.maps?.Map ? undefined : new Error("지도 연결을 확인하지 못했습니다."));
    // 실패를 캐시해두면 이후 화면 재진입 시에도 계속 실패만 반복하므로, 다음 시도 때
    // 새로 로드하도록 캐시를 비운다(예: 일시적 네트워크 오류, 도메인 등록 반영 지연).
    script.onerror = () => {
      finish(new Error("네이버 지도 SDK 로드 실패"));
    };
    document.head.appendChild(script);
  }).catch((error: unknown) => { sdkLoadPromise = null; throw error; });

  return sdkLoadPromise;
}

export type MapParkingSpot = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  walkMinutes: number | null;
  // 목록 화면(주차장 목록)의 표시 순서(1부터). 지도 마커를 텍스트 라벨 대신 이 번호로
  // 표시해서 목록과 대응시킨다 — 좌표 있는 것만 지도에 그려서(필터링) 배열 인덱스가
  // 목록 순서와 어긋날 수 있어 호출부에서 필터링 전에 미리 매긴 번호를 넘겨받는다.
  order: number;
};

export type MapCoord = { latitude: number; longitude: number };

// 전체 코스 경로의 기본 짙기. 현재 구간이 정해지면 여기까지 물러난다.
const ROUTE_OPACITY = 0.85;
const ROUTE_OPACITY_DIM = 0.3;

// 마커 content는 문자열로 조립해 innerHTML처럼 삽입되므로, 외부 API에서 온 주차장
// 이름을 그대로 넣으면 안 된다.
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// 기본은 번호 배지만(라벨이 항상 떠 있으면 주차장이 몰린 지역에서 서로 겹쳐 못 읽는다).
// 마커를 탭하면 그 마커만 이름·도보시간 라벨을 위에 띄운다.
//
// 마커 content는 문자열이지만 실제로는 앱 DOM 안에 삽입되므로 globals.css의 전역
// 클래스가 그대로 먹는다. 그래서 인라인 스타일 대신 sk-mappin / sk-mappin-on /
// sk-maplabel을 쓴다 — 나머지 UI와 같은 조형(사각 슬롯 + 우하단 각진 모서리)과
// 같은 모션(선택 시 pop + settle + 파문 한 번)을 공유한다. 크기는 26px 그대로라
// anchor 좌표와 지도 가독성은 바뀌지 않는다.
//
// setIcon은 마커 DOM을 통째로 갈아끼운다 — 그래서 CSS transition은 아예 걸리지 않고,
// 상태 변화는 "등장 애니메이션"으로만 표현할 수 있다. 세 가지뿐이다.
//  · entering: 지도에 처음 꽂힐 때(sk-mappin-drop). 순번(--i)만큼 늦게 떨어진다.
//  · releasing: 선택이 다른 핀으로 넘어갈 때(sk-mappin-off). 짧고 약하게 — 새 핀의
//    sk-grab과 동시에 강하게 튀면 어디가 선택됐는지 읽기 어려워진다.
//  · selected: sk-mappin-on. 기존 grab + 파문 한 번 그대로.
function spotMarkerIcon(
  spot: MapParkingSpot,
  naver: Window["naver"],
  opts: { selected?: boolean; entering?: number | null; releasing?: boolean } = {}
) {
  if (!opts.selected) {
    const extra =
      opts.entering != null
        ? ` sk-mappin-drop" style="--i:${opts.entering}`
        : opts.releasing
          ? " sk-mappin-off"
          : "";
    return {
      content: `<div class="sk-mappin${extra}">${spot.order}</div>`,
      anchor: new naver.maps.Point(13, 13),
    };
  }
  const label = [spot.name, spot.walkMinutes !== null ? `도보 ${spot.walkMinutes}분` : null]
    .filter(Boolean)
    .join(" · ");
  return {
    content: `<div style="position:relative;">
      <div class="sk-mappin sk-mappin-on" style="position:absolute;left:0;top:0;transform:translate(-50%,-50%);">${spot.order}</div>
      <div class="sk-maplabel" style="position:absolute;left:0;top:-18px;transform:translate(-50%,-100%);">${escapeHtml(label)}</div>
    </div>`,
    anchor: new naver.maps.Point(0, 0),
  };
}

function spotSig(s: MapParkingSpot): string {
  return `${s.id}~${s.latitude}~${s.longitude}~${s.order}~${s.name}~${s.walkMinutes}`;
}
// 경로가 바뀌었는지 보는 서명. 좌표를 전부 이어 붙이면 점이 수백 개인 경로에서
// 렌더마다 긴 문자열을 만들게 되므로, 길이 + 네 지점만 본다(양 끝만 보면 출발·도착이
// 같고 중간만 다른 두 경로를 같은 것으로 본다 — 실제로 구간마다 그런 경우가 있다).
function pathSig(path: MapCoord[] | undefined): string {
  if (!path || path.length < 2) return "";
  const at = (i: number) => {
    const c = path[Math.min(path.length - 1, Math.max(0, i))];
    return `${c.latitude},${c.longitude}`;
  };
  const n = path.length;
  return [n, at(0), at(Math.floor(n / 3)), at(Math.floor((2 * n) / 3)), at(n - 1)].join("~");
}

export function NaverMap({
  center,
  destinationLabel,
  spots,
  origin,
  routePath,
  highlightPath,
  fitTo,
  className,
  controlsBottom,
  controlsAnimated = true,
  selectedId,
  onSelect,
  bottomInsetRatio,
}: {
  center: { latitude: number; longitude: number };
  // MapScreen(코스 지도)처럼 정류지 전부를 spots 번호 배지로만 보여줄 땐 별도 목적지
  // 마커가 필요 없다 — 그럴 때만 생략(undefined)한다.
  destinationLabel?: string;
  spots: MapParkingSpot[];
  // 길찾기 화면(DirectionsScreen)용 — 출발지 마커. "내 위치로 이동" 버튼이 찍는 파란
  // 점(moveToMyLocation)과 같은 스타일을 그냥 재사용한다(둘 다 "여기서 출발" 의미).
  origin?: { latitude: number; longitude: number };
  // 길찾기 경로 폴리라인. 있으면 지도 범위(fitBounds)에도 포함시켜 경로 전체가 보이게 한다.
  routePath?: MapCoord[];
  // 현재 구간만 따로 강조하는 선. 주면 전체 경로(routePath)는 뒤로 물러나고 이 선이
  // 출발점에서 도착점 쪽으로 그어진다 — 추천 카드의 "1 → 선 → 2"를 지도에서 잇는 부분.
  highlightPath?: MapCoord[];
  // 카메라를 여기에 맞춘다. 값이 "바뀔 때만" 움직이므로, 핀을 탭하는 것만으로는
  // 지도가 움직이지 않는다(보던 자리를 뺏지 않는다). 구간을 넘기는 것처럼 사용자가
  // "데려가 달라"고 한 동작에만 넘긴다.
  fitTo?: MapCoord[];
  // 기본은 카드형(둥근 모서리, 고정 높이 18rem) — 화면 전체를 채우는 바텀시트 배경 등
  // 다른 레이아웃이 필요할 때만 넘긴다(예: "absolute inset-0").
  className?: string;
  // 현재 위치 버튼의 bottom 값(CSS). 지도 위에 바텀시트를 얹는 화면은 시트 높이가
  // 바뀌므로 그 위로 버튼을 밀어올려야 한다 — 시트가 없으면 넘기지 않아도 된다.
  controlsBottom?: string;
  // 시트를 손가락으로 끄는 중에는 버튼이 200ms씩 늦게 따라와 어긋나 보이므로 끈다.
  controlsAnimated?: boolean;
  // 주차장 목록과 선택을 맞출 때만 넘긴다(제어형). 안 넘기면 지도가 자체 상태로 토글한다.
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  // 지도 위에 얹히는 바텀시트가 초기 상태에서 컨테이너 아래쪽을 가리는 비율(0~1).
  // fitBounds는 시트 존재를 모르고 컨테이너 전체 기준으로 마커를 배치하므로, 이걸
  // 안 넘기면 목적지/주차장 마커가 시트 뒤에 가려질 수 있다(주차장이 목적지보다 아래
  // 방향에 몰려 있으면 특히 잘 생김 — 2026-09-28 실사용자 리포트).
  bottomInsetRatio?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<NaverMapInstance | null>(null);
  const myLocationMarkerRef = useRef<NaverMarkerInstance | null>(null);
  const selectedSpotIdRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  // 지도를 다시 만들지 않고 최신 prop으로 맞추기 위한 동기화 함수. 초기화가 끝나야 생긴다.
  const syncRef = useRef<(() => void) | null>(null);
  const propsRef = useRef({ center, destinationLabel, spots, origin, routePath, highlightPath, fitTo, selectedId, bottomInsetRatio });

  // 렌더 중 ref를 건드리면 안 되므로(react-hooks/refs) 커밋 후에 최신 값으로 맞춘다. 지도 초기화
  // effect보다 위에 둬서 마운트 때 SDK 로드가 끝나기 전에 먼저 채워지게 한다.
  useEffect(() => {
    onSelectRef.current = onSelect;
    propsRef.current = { center, destinationLabel, spots, origin, routePath, highlightPath, fitTo, selectedId, bottomInsetRatio };
  });

  // 매 렌더 뒤에 한 번 맞춘다. 비교는 전부 문자열 서명이라, 값이 그대로면 아무 일도 하지 않는다
  // (배열 prop은 렌더마다 새 배열이라 의존성 배열로는 걸러지지 않는다).
  useEffect(() => {
    syncRef.current?.();
  });

  const [locating, setLocating] = useState(false);
  // 권한 거부/미지원/타임아웃을 구분하지 않는다 — getCurrentPosition이 전부 null로
  // 뭉뚱그리고, 사용자가 할 수 있는 조치도 "권한을 허용해달라" 하나뿐이라 같은 안내면 된다.
  const [locateFailed, setLocateFailed] = useState(false);

  // 내 위치로 이동. 실패해도 지도는 기존 중심(장소)을 그대로 유지한다 —
  // 위치를 못 얻었다고 화면을 망가뜨릴 이유가 없다.
  async function moveToMyLocation() {
    const map = mapRef.current;
    if (!map || locating) return;

    setLocating(true);
    setLocateFailed(false);
    const position = await getCurrentPosition();
    setLocating(false);

    if (!position) {
      setLocateFailed(true);
      return;
    }

    const { naver } = window;
    const latlng = new naver.maps.LatLng(position.latitude, position.longitude);
    if (myLocationMarkerRef.current) {
      myLocationMarkerRef.current.setPosition(latlng);
    } else {
      myLocationMarkerRef.current = new naver.maps.Marker({
        position: latlng,
        map,
        icon: {
          content: `<div class="sk-mapme"></div>`,
          anchor: new naver.maps.Point(9, 9),
        },
      });
    }
    map.panTo(latlng);
  }

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
    if (!clientId || !containerRef.current) return;

    let cancelled = false;

    loadNaverMapsSdk(clientId)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const { naver } = window;
        const first = propsRef.current;
        const centerLatLng = new naver.maps.LatLng(first.center.latitude, first.center.longitude);
        const map = new naver.maps.Map(containerRef.current, { center: centerLatLng, zoom: 15 });
        mapRef.current = map;
        const toLatLng = (c: MapCoord) => new naver.maps.LatLng(c.latitude, c.longitude);

        // anchor를 (0,0)으로 두고 콘텐츠 자체를 absolute+transform으로 밀어서, 라벨
        // 너비가 가변이어도 항상 "원의 아래쪽 끝"이 좌표에 정확히 맞도록 한다(카카오
        // CustomOverlay의 비율 기반 yAnchor와 달리 네이버는 픽셀 앵커라 폭을 몰라도
        // 되는 이 방식이 더 안전하다).
        if (first.destinationLabel) {
          new naver.maps.Marker({
            position: centerLatLng,
            map,
            icon: {
              content: `<div style="position:relative;">
                <div style="position:absolute;left:0;bottom:0;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:5px;">
                  <div class="sk-maplabel">${first.destinationLabel}</div>
                  <div class="sk-mappin sk-mappin-on" style="width:28px;height:28px;">
                    <div style="width:9px;height:9px;border-radius:999px;background:#fff;"></div>
                  </div>
                </div>
              </div>`,
              anchor: new naver.maps.Point(0, 0),
            },
          });
        }

        // ── 여기부터가 "지도를 다시 만들지 않고 prop을 따라가는" 부분이다. ───────────
        // 예전엔 마커·경로를 이 초기화 블록에서 한 번만 만들었다. 그래서
        //  · 코스 구간 경로(legsQuery)는 지도가 뜬 뒤에 도착하므로 선이 아예 안 그려졌고,
        //  · "다음 장소로"를 눌러도 지도의 두 핀이 앞 구간에 머물러 있었고,
        //  · 길찾기의 추천 경로/다른 경로 탭을 바꿔도 선이 그대로였다(실측).
        // 아래 sync()는 서명이 바뀐 것만 건드린다 — 모션을 얹을 자리를 만드는 동시에
        // 위 세 가지가 함께 고쳐진다.
        type Entry = { marker: NaverMarkerInstance; spot: MapParkingSpot; sig: string; on: boolean };
        const markers = new Map<string, Entry>();
        let originMarker: NaverMarkerInstance | null = null;
        let basePoly: NaverPolylineInstance | null = null;
        let hiPoly: NaverPolylineInstance | null = null;
        let baseOpacity = 0;
        let cancelBase: (() => void) | null = null;
        let cancelHi: (() => void) | null = null;
        let sigSpots = "";
        let sigOrigin = "";
        let sigRoute = "";
        let sigRouteDim = "";
        let sigHi = "";
        // 최초 카메라는 아래 initial fitBounds가 잡는다 — 마운트 직후 한 번 더 움직이지 않게
        // 현재 값을 미리 넣어둔다.
        let sigFit = (first.fitTo ?? []).map((c) => `${c.latitude},${c.longitude}`).join("|");
        let selectedNow: string | null = null;

        const applySelection = (id: string | null) => {
          selectedNow = id;
          selectedSpotIdRef.current = id;
          for (const [mid, e] of markers) {
            const on = mid === id;
            // 바뀐 마커만 다시 그린다. 전부 setIcon하면 (1) 안 바뀐 핀의 DOM까지
            // 매번 새로 만들고 (2) 놓아주는 핀과 잡는 핀을 구분할 수 없다.
            if (e.on === on) continue;
            e.on = on;
            e.marker.setIcon(spotMarkerIcon(e.spot, naver, { selected: on, releasing: !on }));
          }
        };
        const selectSpot = (id: string) => {
          applySelection(selectedSpotIdRef.current === id ? null : id);
          onSelectRef.current?.(id);
        };

        const sync = () => {
          const p = propsRef.current;

          // ── 핀 ──────────────────────────────────────────────────────────────
          const sig = p.spots.map(spotSig).join(";");
          if (sig !== sigSpots) {
            sigSpots = sig;
            const next = new Set(p.spots.map((s) => s.id));
            for (const [id, e] of markers) {
              if (next.has(id)) continue;
              e.marker.setMap(null);
              markers.delete(id);
            }
            let dropIndex = 0;
            for (const spot of p.spots) {
              const prev = markers.get(spot.id);
              const moved =
                prev && (prev.spot.latitude !== spot.latitude || prev.spot.longitude !== spot.longitude);
              if (prev && !moved) {
                // 자리는 그대로고 내용만 바뀐 경우(이름·도보시간). 다시 떨어뜨리지 않는다.
                const esig = spotSig(spot);
                if (prev.sig !== esig) {
                  prev.spot = spot;
                  prev.sig = esig;
                  prev.marker.setIcon(spotMarkerIcon(spot, naver, { selected: prev.on }));
                }
                continue;
              }
              if (prev) {
                prev.marker.setMap(null);
                markers.delete(spot.id);
              }
              const marker = new naver.maps.Marker({
                position: toLatLng(spot),
                map,
                icon: spotMarkerIcon(spot, naver, { entering: dropIndex }),
              });
              naver.maps.Event.addListener(marker, "click", () => selectSpot(spot.id));
              markers.set(spot.id, { marker, spot, sig: spotSig(spot), on: false });
              dropIndex += 1;
            }
            // 새로 꽂은 핀은 전부 중립 상태다 — 선택을 다시 입혀야 한다.
            selectedNow = null;
          }

          // ── 선택 ────────────────────────────────────────────────────────────
          applySelection((p.selectedId !== undefined ? p.selectedId : selectedNow) ?? null);

          // ── 출발지(파란 점) ─────────────────────────────────────────────────
          const osig = p.origin ? `${p.origin.latitude},${p.origin.longitude}` : "";
          if (osig !== sigOrigin) {
            sigOrigin = osig;
            if (!p.origin) {
              originMarker?.setMap(null);
              originMarker = null;
            } else if (originMarker) {
              originMarker.setPosition(toLatLng(p.origin));
            } else {
              originMarker = new naver.maps.Marker({
                position: toLatLng(p.origin),
                map,
                icon: { content: `<div class="sk-mapme"></div>`, anchor: new naver.maps.Point(9, 9) },
              });
            }
          }

          // ── 전체 경로 ───────────────────────────────────────────────────────
          const rsig = pathSig(p.routePath);
          const dim = pathSig(p.highlightPath) ? "dim" : "full";
          if (rsig !== sigRoute) {
            sigRoute = rsig;
            sigRouteDim = dim;
            cancelBase?.();
            cancelBase = null;
            const pts = (p.routePath ?? []).map(toLatLng);
            if (pts.length > 1) {
              const target = dim === "dim" ? ROUTE_OPACITY_DIM : ROUTE_OPACITY;
              if (!basePoly) {
                // 처음 그릴 때는 짙기만 올린다 — 선은 이미 제자리에 있으므로
                // "경로가 어디로 가는지"를 한 프레임도 늦게 보여주지 않는다.
                basePoly = new naver.maps.Polyline({
                  map,
                  path: pts,
                  strokeColor: "#14b8a6",
                  strokeWeight: 5,
                  strokeOpacity: 0,
                  strokeLineCap: "round",
                  strokeLineJoin: "round",
                  zIndex: 1,
                });
                cancelBase = rampRouteOpacity(basePoly as PolylineLike, 0, target);
              } else {
                // 경로가 통째로 바뀌었다(길찾기의 추천 경로 ↔ 다른 경로). 이건
                // 정보가 이미 있던 자리를 갈아끼우는 것이라, 새 경로가 그어지는 편이
                // 어디가 달라졌는지 읽힌다.
                basePoly.setOptions({ strokeOpacity: target });
                cancelBase = drawRoute(basePoly as PolylineLike, pts);
              }
              baseOpacity = target;
            } else if (basePoly) {
              basePoly.setMap(null);
              basePoly = null;
              baseOpacity = 0;
            }
          } else if (dim !== sigRouteDim && basePoly) {
            // 경로는 그대로인데 구간 강조만 켜지거나 꺼졌다 — 짙기만 옮긴다.
            sigRouteDim = dim;
            cancelBase?.();
            const target = dim === "dim" ? ROUTE_OPACITY_DIM : ROUTE_OPACITY;
            cancelBase = rampRouteOpacity(basePoly as PolylineLike, baseOpacity, target);
            baseOpacity = target;
          }

          // ── 현재 구간 ───────────────────────────────────────────────────────
          const hsig = pathSig(p.highlightPath);
          if (hsig !== sigHi) {
            sigHi = hsig;
            cancelHi?.();
            cancelHi = null;
            const pts = (p.highlightPath ?? []).map(toLatLng);
            if (pts.length > 1) {
              if (!hiPoly) {
                hiPoly = new naver.maps.Polyline({
                  map,
                  path: pts.slice(0, 2),
                  strokeColor: "#0d9488",
                  strokeWeight: 6,
                  strokeOpacity: 0.95,
                  strokeLineCap: "round",
                  strokeLineJoin: "round",
                  zIndex: 3,
                });
              }
              cancelHi = drawRoute(hiPoly as PolylineLike, pts);
            } else if (hiPoly) {
              hiPoly.setMap(null);
              hiPoly = null;
            }
          }

          // ── 카메라 ──────────────────────────────────────────────────────────
          const fsig = (p.fitTo ?? []).map((c) => `${c.latitude},${c.longitude}`).join("|");
          if (fsig && fsig !== sigFit) {
            sigFit = fsig;
            const pts = (p.fitTo ?? []).map(toLatLng);
            const b = new naver.maps.LatLngBounds(pts[0], pts[0]);
            for (const ll of pts) b.extend(ll);
            map.fitBounds(b, { top: 56, right: 44, bottom: 44, left: 44 });
          }
        };

        syncRef.current = sync;
        sync();

        // 목적지 기준 고정 줌 대신, 목적지+모든 핀+경로가 한 화면에 들어오도록 자동 조정
        // (주차장이 5km+ 떨어져 있어 마커가 화면 밖으로 벗어나는 문제 방지). 위쪽
        // 여백(40px)은 목적지 마커 라벨 pill이 뷰포트 경계에서 잘리는 문제 방지용.
        // 아래쪽 여백은 bottomInsetRatio만큼 더 준다 — 안 그러면 fitBounds가 컨테이너
        // 전체 기준으로 마커를 배치해서, 그 위에 얹힌 바텀시트가 목적지/주차장 마커를
        // 그대로 가려버린다(주차장이 목적지보다 아래쪽에 몰려 있을 때 특히 잘 드러남).
        const bounds = new naver.maps.LatLngBounds(centerLatLng, centerLatLng);
        for (const s of first.spots) bounds.extend(toLatLng(s));
        if (first.origin) bounds.extend(toLatLng(first.origin));
        for (const c of first.routePath ?? []) bounds.extend(toLatLng(c));
        for (const c of first.fitTo ?? []) bounds.extend(toLatLng(c));
        if (
          first.spots.length > 0 ||
          first.origin ||
          (first.routePath && first.routePath.length > 1) ||
          (first.fitTo && first.fitTo.length > 0)
        ) {
          const containerHeight = containerRef.current?.clientHeight ?? 0;
          const bottom = 20 + containerHeight * (first.bottomInsetRatio ?? 0);
          map.fitBounds(bounds, { top: 40, right: 20, bottom, left: 20 });
        }
      })
      .catch(() => {
        if (!cancelled && errorRef.current) {
          errorRef.current.hidden = false;
        }
      });

    return () => {
      cancelled = true;
      syncRef.current = null;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
    // 의존성 없음: 지도 인스턴스는 한 번만 만들고, 이후 변화는 위 sync()가 받는다.
  }, []);

  if (!process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID) {
    return (
      <div
        className={
          className
            ? `flex items-center justify-center bg-slate-100 text-center text-[13px] text-muted ${className}`
            : "flex h-72 w-full items-center justify-center rounded-2xl bg-slate-100 text-center text-[13px] text-muted"
        }
      >
        네이버 지도 Client ID가 설정되지 않았습니다.
        <br />
        NEXT_PUBLIC_NAVER_MAP_CLIENT_ID를 확인해주세요.
      </div>
    );
  }

  // className이 없으면 기본(카드형, relative)을 쓰고, 있으면 그대로 다 넘긴다 —
  // "relative"를 항상 같이 붙이면 호출부가 "absolute"를 넘겨도 Tailwind가 둘 다
  // 클래스 목록에 있을 때 relative를 이긴다(같은 지정도, 나중 스타일시트 순서로 결정
  // 되고 className 문자열 안 순서가 아님) — 그러면 absolute가 무시돼서 높이가 0이 됨.
  return (
    <div className={className ? `overflow-hidden bg-slate-100 ${className}` : "relative h-72 w-full overflow-hidden rounded-2xl bg-slate-100"}>
      <div ref={containerRef} className="h-full w-full" />

      {locateFailed && (
        <div
          className={`pointer-events-none absolute right-3 mb-2 rounded-lg bg-slate-900/85 px-3 py-1.5 text-[12px] text-white ${
            controlsAnimated ? "sk-glide-bottom" : ""
          }`}
          style={{ bottom: `calc(${controlsBottom ?? "0.75rem"} + 2.75rem)` }}
        >
          위치 권한을 허용해주세요
        </div>
      )}
      <button
        type="button"
        onClick={moveToMyLocation}
        disabled={locating}
        aria-label="현재 위치로 이동"
        style={{ bottom: controlsBottom ?? "0.75rem" }}
        className={`sk-map-loc absolute right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-md disabled:opacity-60 ${
          controlsAnimated ? "sk-glide-bottom" : ""
        }`}
      >
        {/* 조준점 아이콘 — 위치 확인 중에는 회전시켜 진행 상태를 표시 */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`h-5 w-5 ${locating ? "animate-spin" : ""}`}
        >
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
          <path d="M12 1v3M12 20v3M23 12h-3M4 12H1" strokeLinecap="round" />
        </svg>
      </button>

      <div ref={errorRef} hidden className="absolute inset-0 flex items-center justify-center bg-slate-100 text-[13px] text-muted">
        지도를 불러오지 못했습니다.
      </div>
    </div>
  );
}
