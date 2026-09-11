// 브라우저에서 사용하는 카카오 SDK의 최소 계약. 서버 REST 키는 이 모듈에서 사용하지 않는다.
export interface MapCoordinate { latitude: number; longitude: number }
interface LatLng { getLat(): number; getLng(): number }
interface Bounds { extend(point: LatLng): void }
export interface KakaoMapInstance {
  setCenter(point: LatLng): void;
  getCenter(): LatLng;
  panTo(point: LatLng): void;
  setBounds(bounds: Bounds, top?: number, right?: number, bottom?: number, left?: number): void;
  getLevel(): number;
  setLevel(level: number): void;
  relayout(): void;
}
export interface KakaoOverlay { setMap(map: KakaoMapInstance | null): void }
export interface KakaoMaps {
  load(callback: () => void): void;
  Map: new (container: HTMLElement, options: { center: LatLng; level: number }) => KakaoMapInstance;
  LatLng: new (latitude: number, longitude: number) => LatLng;
  LatLngBounds: new () => Bounds;
  CustomOverlay: new (options: {
    map: KakaoMapInstance; position: LatLng; content: HTMLElement;
    yAnchor?: number; zIndex?: number; clickable?: boolean;
  }) => KakaoOverlay;
}
declare global { interface Window { kakao?: { maps: KakaoMaps } } }

let pending: Promise<KakaoMaps> | null = null;

export function loadKakaoMap(key: string): Promise<KakaoMaps> {
  if (!key.trim()) return Promise.reject(new Error("지도 연결이 준비되지 않았습니다."));
  if (window.kakao?.maps.Map) return Promise.resolve(window.kakao.maps);
  if (pending) return pending;
  pending = new Promise<KakaoMaps>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "motion-kakao-map-sdk";
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key.trim())}&autoload=false`;
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (error) { script.remove(); reject(error); }
      else resolve(window.kakao!.maps);
    };
    const timer = setTimeout(() => finish(new Error("지도를 불러오는 시간이 오래 걸립니다. 다시 시도해 주세요.")), 12000);
    script.onerror = () => finish(new Error("지도를 불러오지 못했습니다. 연결 상태를 확인해 주세요."));
    script.onload = () => {
      if (finished) return;
      try {
        if (!window.kakao?.maps.load) throw new Error("지도 연결을 확인하지 못했습니다.");
        window.kakao.maps.load(() => {
          if (!window.kakao?.maps.Map || !window.kakao.maps.CustomOverlay) finish(new Error("지도 연결을 확인하지 못했습니다."));
          else finish();
        });
      } catch { finish(new Error("지도 연결을 확인하지 못했습니다.")); }
    };
    document.head.appendChild(script);
  }).catch((error: unknown) => { pending = null; throw error; });
  return pending;
}

export function isMapCoordinate(value: MapCoordinate): boolean {
  return Number.isFinite(value.latitude) && Number.isFinite(value.longitude)
    && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180
    && value.latitude !== 0 && value.longitude !== 0;
}
