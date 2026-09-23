"use client";

import { useEffect, useState } from "react";
import { getProviders, signIn } from "next-auth/react";

// 로그인 화면과 회원가입 화면 모두 같은 버튼을 쓴다 — OAuth는 가입/로그인이 같은
// 동작이라(처음 온 사람은 lib/auth.ts의 jwt 콜백이 upsert로 계정을 만든다).
const LABELS: Record<string, string> = {
  google: "Google로 계속하기",
  kakao: "카카오로 계속하기",
  naver: "네이버로 계속하기",
};
const STYLES: Record<string, string> = {
  google: "border border-hairline bg-white text-ink",
  kakao: "bg-[#FEE500] text-[#3C1E1E]",
  naver: "bg-[#03C75A] text-white",
};

// 각 서비스 로그인 버튼에 쓰는 마크. 아이콘 라이브러리를 새로 넣지 않고 브랜드 심볼만
// 인라인 SVG로 직접 그린다(구글은 4색 G, 카카오/네이버는 버튼 배경이 이미 브랜드색이라
// currentColor 단색 심볼).
const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  google: (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  ),
  kakao: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]" aria-hidden>
      <path d="M12 3C6.48 3 2 6.48 2 10.8c0 2.76 1.85 5.19 4.64 6.6-.2.75-.73 2.7-.84 3.12-.13.52.19.51.4.37.16-.11 2.55-1.73 3.6-2.44.7.1 1.42.15 2.2.15 5.52 0 10-3.48 10-7.8S17.52 3 12 3z" />
    </svg>
  ),
  naver: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-[16px] w-[16px]" aria-hidden>
      <path d="M16.273 12.845 7.376 0H0v24h7.727V11.156L16.624 24H24V0h-7.727z" />
    </svg>
  ),
};

export function SocialLoginButtons({ callbackUrl }: { callbackUrl: string }) {
  // 서버가 어떤 provider를 실제로 켜뒀는지(env에 키가 있는지)는 클라이언트가 미리 알 방법이
  // 없어서 next-auth의 getProviders()로 물어본다 — 키가 없는 provider는 아예 안 뜬다.
  const [providerIds, setProviderIds] = useState<string[]>([]);
  useEffect(() => {
    getProviders().then((providers) => {
      setProviderIds(Object.keys(providers ?? {}).filter((id) => id !== "credentials"));
    });
  }, []);

  if (providerIds.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 py-1 text-[12px] text-muted">
        <span className="h-px flex-1 bg-hairline" />
        또는
        <span className="h-px flex-1 bg-hairline" />
      </div>
      {providerIds.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => signIn(id, { callbackUrl })}
          className={`flex items-center justify-center gap-2 rounded-full py-2.5 text-[14px] font-semibold ${STYLES[id] ?? "border border-hairline bg-white text-ink"}`}
        >
          {PROVIDER_ICONS[id]}
          {LABELS[id] ?? `${id}로 계속하기`}
        </button>
      ))}
    </div>
  );
}
