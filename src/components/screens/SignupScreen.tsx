"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScreenHeader } from "@/components/ScreenHeader";
import { noteReplace, useBack } from "@/lib/useBack";
import { Logo } from "@/components/Logo";

export function SignupScreen() {
  const router = useRouter();
  const goBack = useBack("/login");
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSignup() {
    setError("");
    setPending(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "회원가입에 실패했습니다.");
        return;
      }
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError("가입은 됐지만 로그인에 실패했습니다. 다시 로그인해주세요.");
        router.push(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
        return;
      }
      noteReplace();
      router.replace(next || "/mypage");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <ScreenHeader title="회원가입" onBack={goBack} />
      {/* 로그인·가입은 서비스를 처음 마주하는 화면이라 이름을 한 번 보여준다 */}
      <div className="flex flex-col items-center gap-2 px-5 pb-6 pt-2">
        <Logo className="h-[30px]" />
        <p className="text-[13px] text-muted">대구 나들이 코스를 저장하고 다시 꺼내 보세요.</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSignup();
        }}
        className="flex flex-col gap-3 px-5"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름 (선택)"
          className="rounded-full bg-white px-4 py-2.5 text-[14px] text-ink shadow-[0_1px_3px_rgba(17,24,39,0.05)] outline-none placeholder:text-muted/60"
        />
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
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호 (8자 이상)"
          className="rounded-full bg-white px-4 py-2.5 text-[14px] text-ink shadow-[0_1px_3px_rgba(17,24,39,0.05)] outline-none placeholder:text-muted/60"
        />
        {error && <p className="px-1 text-[13px] text-rose-500">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-1 flex items-center justify-center gap-1.5 rounded-full bg-cta py-3 text-[15px] font-semibold text-white disabled:bg-slate-200"
        >
          회원가입
        </button>
      </form>
    </>
  );
}
