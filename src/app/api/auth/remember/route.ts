import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// next-auth(JWT 세션)의 쿠키 만료 시간은 session.maxAge(앱 전역 고정값)로만 정해지고,
// 로그인 시점마다 "이번엔 브라우저 닫으면 로그아웃"을 고를 방법이 라이브러리에 없다.
// 그래서 로그인/회원가입 직후 이 라우트를 한 번 더 불러서, "자동 로그인" 체크를 안 했을
// 때만 같은 쿠키를 만료시간 없이(=세션 쿠키, 브라우저 종료 시 자동 삭제) 다시 심는다.
// 값(JWT)은 그대로라 서버 쪽 검증 로직은 손댈 필요가 없다.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({ remember: true }));
  if (body?.remember !== false) return NextResponse.json({ ok: true });

  const isSecure = process.env.NODE_ENV === "production";
  const cookieName = `${isSecure ? "__Secure-" : ""}authjs.session-token`;
  const store = await cookies();
  const existing = store.get(cookieName);
  if (existing) {
    store.set(cookieName, existing.value, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: isSecure,
      // expires/maxAge를 생략하면 세션 쿠키가 된다.
    });
  }
  return NextResponse.json({ ok: true });
}
