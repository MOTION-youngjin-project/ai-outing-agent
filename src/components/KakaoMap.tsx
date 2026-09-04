"use client";

import { useEffect, useRef } from "react";

// 카카오맵 JS SDK 타입은 별도 패키지 없이(설치 안 함) 필요한 만큼만 선언.
declare global {
  interface Window {
    kakao: {
      maps: {
        load: (cb: () => void) => void;
        Map: new (container: HTMLElement, options: { center: unknown; level: number }) => {
          setBounds: (bounds: unknown) => void;
        };
        LatLng: new (lat: number, lng: number) => unknown;
        LatLngBounds: new () => { extend: (latlng: unknown) => void };
        CustomOverlay: new (options: {
          position: unknown;
          content: string | HTMLElement;
          yAnchor?: number;
        }) => { setMap: (map: unknown) => void };
      };
    };
  }
}

let sdkLoadPromise: Promise<void> | null = null;

// 스크립트 태그를 페이지당 한 번만 주입하고, 이후 호출은 같은 Promise를 재사용한다.
function loadKakaoMapsSdk(appkey: string): Promise<void> {
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve, reject) => {
    if (window.kakao?.maps) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appkey}&autoload=false`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(() => resolve());
    // 실패를 캐시해두면 이후 화면 재진입 시에도 계속 실패만 반복하므로, 다음 시도 때
    // 새로 로드하도록 캐시를 비운다(예: 일시적 네트워크 오류, 도메인 등록 반영 지연).
    script.onerror = () => {
      sdkLoadPromise = null;
      reject(new Error("카카오맵 SDK 로드 실패"));
    };
    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}

export type MapParkingSpot = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  walkMinutes: number | null;
};

export function KakaoMap({
  center,
  destinationLabel,
  spots,
}: {
  center: { latitude: number; longitude: number };
  destinationLabel: string;
  spots: MapParkingSpot[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const appkey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    if (!appkey || !containerRef.current) return;

    let cancelled = false;

    loadKakaoMapsSdk(appkey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const { kakao } = window;
        const centerLatLng = new kakao.maps.LatLng(center.latitude, center.longitude);
        const map = new kakao.maps.Map(containerRef.current, { center: centerLatLng, level: 4 });

        new kakao.maps.CustomOverlay({
          position: centerLatLng,
          yAnchor: 1.3,
          content: `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
            <div style="background:#111827;color:#fff;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;white-space:nowrap;">${destinationLabel}</div>
            <div style="width:28px;height:28px;border-radius:999px;background:#f5a623;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,0.3);">
              <div style="width:10px;height:10px;border-radius:999px;background:#fff;"></div>
            </div>
          </div>`,
        }).setMap(map);

        const bounds = new kakao.maps.LatLngBounds();
        bounds.extend(centerLatLng);

        for (const spot of spots) {
          const position = new kakao.maps.LatLng(spot.latitude, spot.longitude);
          bounds.extend(position);
          const walkLabel = spot.walkMinutes !== null ? `도보 ${spot.walkMinutes}분` : spot.name;
          new kakao.maps.CustomOverlay({
            position,
            yAnchor: 1.3,
            content: `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
              <div style="background:#111827;color:#fff;font-size:11px;font-weight:600;padding:3px 8px;border-radius:999px;white-space:nowrap;">${walkLabel}</div>
              <div style="width:26px;height:26px;border-radius:999px;background:#14b8a6;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,0.3);">P</div>
            </div>`,
          }).setMap(map);
        }

        // 목적지 기준 고정 줌 대신, 목적지+모든 주차장이 한 화면에 들어오도록 자동 조정
        // (2026-09-04 실측 — 주차장이 5km+ 떨어져 있어 마커가 화면 밖으로 벗어나는 문제).
        if (spots.length > 0) map.setBounds(bounds);
      })
      .catch(() => {
        if (!cancelled && errorRef.current) {
          errorRef.current.hidden = false;
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- spots/center는 화면 진입 시 한 번만 초기화하면 됨
  }, []);

  if (!process.env.NEXT_PUBLIC_KAKAO_JS_KEY) {
    return (
      <div className="flex h-72 w-full items-center justify-center rounded-2xl bg-slate-100 text-center text-[13px] text-muted">
        카카오맵 JS 키가 설정되지 않았습니다.
        <br />
        NEXT_PUBLIC_KAKAO_JS_KEY를 확인해주세요.
      </div>
    );
  }

  return (
    <div className="relative h-72 w-full overflow-hidden rounded-2xl bg-slate-100">
      <div ref={containerRef} className="h-full w-full" />
      <div ref={errorRef} hidden className="absolute inset-0 flex items-center justify-center bg-slate-100 text-[13px] text-muted">
        지도를 불러오지 못했습니다.
      </div>
    </div>
  );
}
