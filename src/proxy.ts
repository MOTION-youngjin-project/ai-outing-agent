import { auth } from "@/lib/auth";

// /mypage, /settings 로그인 게이트 — 미들웨어(Next.js 16부터 "Proxy")는 세션 쿠키만 보는
// optimistic 체크라, 실제 인가는 여전히 각 API 라우트(auth() 401 체크)가 맡는다. 이건
// 비로그인 상태로 새로고침/직링크 접속했을 때 화면이 잠깐 비었다가 리다이렉트되는 걸
// 막아주는 UX용.
export default auth((req) => {
  if (!req.auth) {
    const next = encodeURIComponent(req.nextUrl.pathname);
    return Response.redirect(new URL(`/login?next=${next}`, req.nextUrl.origin));
  }
});

export const config = {
  matcher: ["/mypage", "/settings"],
};
