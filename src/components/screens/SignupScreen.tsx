"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScreenHeader } from "@/components/ScreenHeader";

const MIN_PASSWORD_LENGTH = 8;

// 초록/빨강 실시간 체크 한 줄 — 조건을 아직 평가할 수 없는 초기 상태(빈 입력)는 회색으로
// 둬서 "아직 안 틀렸다"와 "이미 틀렸다"를 구분한다.
function ValidationRow({ ok, label }: { ok: boolean | null; label: string }) {
  const color = ok === null ? "text-muted" : ok ? "text-emerald-600" : "text-rose-500";
  const mark = ok === null ? "•" : ok ? "✓" : "✕";
  return (
    <p className={`flex items-center gap-1.5 px-1 text-[12.5px] ${color}`}>
      <span aria-hidden>{mark}</span>
      {label}
    </p>
  );
}

export function SignupScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const lengthOk = password.length === 0 ? null : password.length >= MIN_PASSWORD_LENGTH;
  const matchOk = passwordConfirm.length === 0 ? null : password === passwordConfirm;
  const canSubmit = password.length >= MIN_PASSWORD_LENGTH && password === passwordConfirm;

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
      // router.push가 아니라 완전한 새 로드를 쓴다 — /(홈)이 로그인 게이트 대상은
      // 아니지만, 로그인 전에 사이드바가 미리 프리페치해둔 /mypage 응답(비로그인
      // 리다이렉트)이 라우터 캐시에 남아 있으면 다음에 그 링크를 눌렀을 때도 같은 문제가
      // 재현된다 — 새로 로드해서 캐시를 통째로 비운다.
      window.location.href = next || "/";
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <ScreenHeader title="회원가입" onBack={() => router.back()} />
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
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호 (8자 이상)"
          className="rounded-full bg-white px-4 py-2.5 text-[14px] text-ink shadow-[0_1px_3px_rgba(17,24,39,0.05)] outline-none placeholder:text-muted/60"
        />
        <ValidationRow ok={lengthOk} label={`${MIN_PASSWORD_LENGTH}자 이상`} />
        <input
          type="password"
          required
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          placeholder="비밀번호 확인"
          className="rounded-full bg-white px-4 py-2.5 text-[14px] text-ink shadow-[0_1px_3px_rgba(17,24,39,0.05)] outline-none placeholder:text-muted/60"
        />
        <ValidationRow ok={matchOk} label="비밀번호가 일치해요" />
        {error && <p className="px-1 text-[13px] text-rose-500">{error}</p>}
        <button
          type="submit"
          disabled={pending || !canSubmit}
          className="mt-1 flex items-center justify-center gap-1.5 rounded-full bg-cta py-3 text-[15px] font-semibold text-white disabled:bg-slate-200"
        >
          회원가입
        </button>
      </form>
    </>
  );
}
