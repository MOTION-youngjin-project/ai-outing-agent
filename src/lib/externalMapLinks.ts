// 좌표 기반으로 카카오맵/구글 지도/네이버 지도를 여는 링크를 만든다.
// 카카오/구글은 좌표만으로 여는 길찾기 웹 링크가 있지만, 네이버는 공식적으로 없다 —
// NCP 포럼에서 Web Dynamic Map 담당자가 직접 확인해준 내용(2024-04-01,
// https://www.ncloud-forums.com/topic/242/): "Web Url Scheme 관련 문서는 제공하지
// 않습니다", 제공되는 건 `map.naver.com/?lat=&lng=&title=` 형태의 "위치 표시" 웹 링크뿐이고
// 진짜 길찾기는 앱 전용 URL 스킴(nmap://route/car)만 있다. 그래서 네이버만 플랫폼별 분기 +
// 앱 미설치 시 스토어 폴백이 필요하다(iOS는 문서가 권장하는 setTimeout 트릭, Android는
// intent URL의 browser_fallback_url — 둘 다 https://guide.ncloud-docs.com/docs/maps-url-scheme
// 문서에 나온 방식 그대로).
export type Platform = "ios" | "android" | "android-app" | "other";

// 나들플랜 안드로이드 앱(webview_flutter)이 UA 뒤에 붙이는 식별자 — BottomNav.tsx의
// 같은 상수와 중복이지만 이 파일은 순수 함수만 두는 계층이라 컴포넌트 쪽 상수를
// 끌어오지 않는다.
const NATIVE_APP_UA_MARKER = "NadeulPlanApp";

export function detectPlatform(userAgent: string): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) {
    // 진짜 모바일 브라우저(Chrome 등)는 intent:// URL을 직접 해석해 실행하지만,
    // 우리 앱을 감싸는 webview_flutter는 그걸 못 하고 url_launcher로 그대로
    // 넘긴다 — url_launcher는 일반 Uri.parse + ACTION_VIEW만 하고 intent: 스킴의
    // #Intent;...;end 문법을 디코딩하지 않아서(그건 Chrome이 자체적으로 하는
    // 특별 처리다) "intent"라는 글자 그대로의 스킴을 열 수 있는 앱을 못 찾고
    // 조용히 실패한다(실기기 실측: 네이버지도만 안 열림, 카카오/구글은 보통
    // https 링크라 영향 없음). 앱 안에서는 iOS와 같은 커스텀 스킴+폴백 방식을 쓴다.
    return userAgent.includes(NATIVE_APP_UA_MARKER) ? "android-app" : "android";
  }
  return "other";
}

export function kakaoDirectionsUrl(lat: number, lng: number, name: string): string {
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
}

export function googleDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

// 구글 지도 앱 전용 스킴(공식 문서: https://developers.google.com/maps/documentation/urls/android-intents).
// saddr을 생략하면 앱이 알아서 내 위치를 출발지로 잡는다.
// 위 googleDirectionsUrl(웹 링크)은 일반 브라우저 탭에서 열면 앱으로 잘 넘어가지만,
// webview_flutter 안에서 window.open으로 열면 앱 딥링크로 안 튕기고 구글 지도
// 모바일 웹사이트가 웹뷰 안에 그대로 뜬다(실기기 실측: 내 위치 인식이 안 돼 "출발지를
// 설정하라"는 이상한 화면에서 멈춘다) — 네이버·카카오처럼 앱 안에서는 커스텀 스킴을
// 직접 연다.
export function googleDirectionsAppUrl(lat: number, lng: number): string {
  return `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
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
  if (platform === "ios" || platform === "android-app") {
    return {
      kind: "app-with-fallback",
      appUrl: `nmap://route/car?${params}`,
      fallbackUrl: platform === "ios" ? NAVER_APPSTORE_URL : NAVER_PLAYSTORE_URL,
      fallbackDelayMs: 1500,
    };
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
