import { auth } from "@/lib/auth";

// 결제를 뺀 뒤로는 로그인이 앱 사용의 전제 조건이 아니다 — 비로그인 게스트도 광고를
// 보면 질문할 수 있다(ads/quota.ts). 로그인이 필요한 건 개인화 데이터가 걸린
// 화면(마이페이지, 앱 설정)뿐이라 그 둘만 게이트 뒤에 둔다. 미들웨어(Next.js 16부터
// "Proxy")는 세션 쿠키만 보는 optimistic 체크라, 실제 인가는 여전히 각 API
// 라우트(auth() 401 체크)가 맡는다 — 이건 비로그인 상태로 새로고침/직링크 접속했을 때
// 화면이 잠깐 비었다가 리다이렉트되는 걸 막아주는 UX용.
const PROTECTED_PATHS = new Set(["/mypage", "/mypage/planned", "/settings"]);

// Flutter 앱 셸(webview_flutter)이 기기 기본 UA 뒤에 이 문자열을 붙여서 보낸다. 앱 안에서
// 결제 진입점(/billing)을 노출하면 Google Play 정책상 인앱결제(Play Billing) 의무 대상이 되므로,
// 웹뷰 안에서는 이 경로 자체를 서버 단에서 막는다 — 결제는 일반 브라우저(웹)에서만 하게 한다.
// (지금은 사업자등록 전이라 billing/*을 안 쓰고 있지만, 나중에 다시 켤 때를 대비해 그대로 둔다.)
const APP_WEBVIEW_UA_MARKER = "NadeulPlanApp/1.0";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (pathname === "/billing" && req.headers.get("user-agent")?.includes(APP_WEBVIEW_UA_MARKER)) {
    return Response.redirect(new URL("/", req.nextUrl.origin));
  }
  if (PROTECTED_PATHS.has(pathname) && !req.auth) {
    const next = encodeURIComponent(pathname);
    return Response.redirect(new URL(`/login?next=${next}`, req.nextUrl.origin));
  }
});

// api/*는 대상에서 뺀다 — 여긴 각 라우트가 JSON 401을 직접 돌려줘야 하고, 여기서
// HTML 페이지로 리다이렉트하면 fetch 호출부가 깨진다.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
