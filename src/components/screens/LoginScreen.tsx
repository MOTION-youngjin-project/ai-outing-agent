"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SocialLoginButtons } from "@/components/SocialLoginButtons";

export function LoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  // OAuth 실패는 next-auth가 /login?error=... 로 리다이렉트해서 알려준다(pages.error).
  const [error, setError] = useState(
    searchParams.get("error") ? "소셜 로그인에 실패했습니다. 이메일 제공에 동의했는지 확인해 주세요." : "",
  );
  const [pending, setPending] = useState(false);

  async function handleLogin() {
    setError("");
    setPending(true);
    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError("이메일 또는 비밀번호가 올바르지 않습니다.");
        return;
      }
      await fetch("/api/auth/remember", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remember }),
      });
      // router.push가 아니라 완전한 새 로드를 쓴다 — 로그인 전에 미리 프리페치돼 있던
      // /mypage(비로그인 리다이렉트 응답)를 라우터 캐시가 그대로 재사용해 다시 로그인
      // 화면으로 튕기는 문제가 있었다. 새로 요청해야 방금 심은 쿠키로 게이트를 통과한다.
      window.location.href = next || "/mypage";
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <ScreenHeader title="로그인" onBack={() => router.back()} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleLogin();
        }}
        className="flex flex-col gap-3 px-5"
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          className="rounded-full bg-white px-4 py-2.5 text-[14px] text-ink shadow-[0_1px_3px_rgba(17,24,39,0.05)] outline-none placeholder:text-muted/60"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          className="rounded-full bg-white px-4 py-2.5 text-[14px] text-ink shadow-[0_1px_3px_rgba(17,24,39,0.05)] outline-none placeholder:text-muted/60"
        />
        <label className="flex items-center gap-2 px-1 text-[13px] text-ink-soft">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          자동 로그인
        </label>
        {error && <p className="px-1 text-[13px] text-rose-500">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-1 flex items-center justify-center gap-1.5 rounded-full bg-cta py-3 text-[15px] font-semibold text-white disabled:bg-slate-200"
        >
          로그인
        </button>
        <button
          type="button"
          onClick={() => router.push(`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`)}
          className="py-1 text-center text-[13px] text-muted"
        >
          아직 계정이 없으신가요? <span className="font-semibold text-accent">회원가입</span>
        </button>
        <SocialLoginButtons callbackUrl={next || "/mypage"} />
      </form>
    </>
  );
}
