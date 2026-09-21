import { auth } from "@/lib/auth";

// 결제 시스템이 붙은 뒤로 로그인이 앱 사용의 전제 조건이 됐다 — 몇 개 안내/인증
// 페이지만 빼고 전부 로그인 게이트 뒤에 둔다. 미들웨어(Next.js 16부터 "Proxy")는
// 세션 쿠키만 보는 optimistic 체크라, 실제 인가는 여전히 각 API 라우트(auth() 401
// 체크)가 맡는다 — 이건 비로그인 상태로 새로고침/직링크 접속했을 때 화면이 잠깐
// 비었다가 리다이렉트되는 걸 막아주는 UX용.
const PUBLIC_PATHS = new Set(["/login", "/signup", "/privacy", "/account-deletion"]);

// Flutter 앱 셸(webview_flutter)이 기기 기본 UA 뒤에 이 문자열을 붙여서 보낸다. 앱 안에서
// 결제 진입점(/billing)을 노출하면 Google Play 정책상 인앱결제(Play Billing) 의무 대상이 되므로,
// 웹뷰 안에서는 이 경로 자체를 서버 단에서 막는다 — 결제는 일반 브라우저(웹)에서만 하게 한다.
const APP_WEBVIEW_UA_MARKER = "NadeulPlanApp/1.0";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (pathname === "/billing" && req.headers.get("user-agent")?.includes(APP_WEBVIEW_UA_MARKER)) {
    return Response.redirect(new URL("/", req.nextUrl.origin));
  }
  if (PUBLIC_PATHS.has(pathname)) return;
  if (!req.auth) {
    const next = encodeURIComponent(pathname);
    return Response.redirect(new URL(`/login?next=${next}`, req.nextUrl.origin));
  }
});

// api/*는 대상에서 뺀다 — 여긴 각 라우트가 JSON 401을 직접 돌려줘야 하고, 여기서
// HTML 페이지로 리다이렉트하면 fetch 호출부가 깨진다.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
