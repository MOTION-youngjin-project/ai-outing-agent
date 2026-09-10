// 좌표 기반으로 카카오맵/구글 지도/네이버 지도를 여는 링크를 만든다.
// 카카오/구글은 좌표만으로 여는 길찾기 웹 링크가 있지만, 네이버는 공식적으로 없다 —
// NCP 포럼에서 Web Dynamic Map 담당자가 직접 확인해준 내용(2024-04-01,
// https://www.ncloud-forums.com/topic/242/): "Web Url Scheme 관련 문서는 제공하지
// 않습니다", 제공되는 건 `map.naver.com/?lat=&lng=&title=` 형태의 "위치 표시" 웹 링크뿐이고
// 진짜 길찾기는 앱 전용 URL 스킴(nmap://route/car)만 있다. 그래서 네이버만 플랫폼별 분기 +
// 앱 미설치 시 스토어 폴백이 필요하다(iOS는 문서가 권장하는 setTimeout 트릭, Android는
// intent URL의 browser_fallback_url — 둘 다 https://guide.ncloud-docs.com/docs/maps-url-scheme
// 문서에 나온 방식 그대로).
export type Platform = "ios" | "android" | "other";

export function detectPlatform(userAgent: string): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

export function kakaoDirectionsUrl(lat: number, lng: number, name: string): string {
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
}

export function googleDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

const NAVER_APPNAME = "com.aioutingagent.web";
const NAVER_APPSTORE_URL = "https://apps.apple.com/app/id311867728";
const NAVER_PLAYSTORE_URL = "https://play.google.com/store/apps/details?id=com.nhn.android.nmap";

export type NaverNavigationPlan =
  | { kind: "intent"; url: string }
  | { kind: "app-with-fallback"; appUrl: string; fallbackUrl: string; fallbackDelayMs: number }
  | { kind: "web"; url: string };

export function buildNaverNavigationPlan(platform: Platform, lat: number, lng: number, name: string): NaverNavigationPlan {
  const params = `dlat=${lat}&dlng=${lng}&dname=${encodeURIComponent(name)}&appname=${NAVER_APPNAME}`;

  if (platform === "android") {
    return {
      kind: "intent",
      url: `intent://route/car?${params}#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;S.browser_fallback_url=${encodeURIComponent(NAVER_PLAYSTORE_URL)};end`,
    };
  }
  if (platform === "ios") {
    return { kind: "app-with-fallback", appUrl: `nmap://route/car?${params}`, fallbackUrl: NAVER_APPSTORE_URL, fallbackDelayMs: 1500 };
  }
  return { kind: "web", url: `https://map.naver.com/?lng=${lng}&lat=${lat}&title=${encodeURIComponent(name)}` };
}

// plan 실행부(DOM 호출만 있는 얇은 계층 — 분기 자체는 위 buildNaverNavigationPlan에서
// 이미 순수 함수로 검증됨).
export function openNaverNavigation(plan: NaverNavigationPlan): void {
  if (plan.kind === "web") {
    window.open(plan.url, "_blank", "noopener,noreferrer");
    return;
  }
  if (plan.kind === "intent") {
    window.location.href = plan.url;
    return;
  }
  const clickedAt = Date.now();
  window.location.href = plan.appUrl;
  setTimeout(() => {
    if (Date.now() - clickedAt < plan.fallbackDelayMs + 500) window.location.href = plan.fallbackUrl;
  }, plan.fallbackDelayMs);
}
