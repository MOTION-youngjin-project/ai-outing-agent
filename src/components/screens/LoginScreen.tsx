"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScreenHeader } from "@/components/ScreenHeader";
import { noteReplace, useBack } from "@/lib/useBack";
import { Logo } from "@/components/Logo";

export function LoginScreen() {
  const router = useRouter();
  const goBack = useBack("/");
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
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
      // replace — 로그인 뒤 뒤로가기가 다시 로그인 화면으로 오지 않게.
      noteReplace();
      router.replace(next || "/mypage");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <ScreenHeader title="로그인" onBack={goBack} />
      {/* 로그인·가입은 서비스를 처음 마주하는 화면이라 이름을 한 번 보여준다 */}
      <div className="flex flex-col items-center gap-2 px-5 pb-6 pt-2">
        <Logo className="h-[30px]" />
        <p className="text-[13px] text-muted">저장한 코스와 대화 기록을 이어서 볼 수 있어요.</p>
      </div>

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
      </form>
    </>
  );
}
