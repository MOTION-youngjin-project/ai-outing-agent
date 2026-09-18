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
          className={`rounded-full py-2.5 text-[14px] font-semibold ${STYLES[id] ?? "border border-hairline bg-white text-ink"}`}
        >
          {LABELS[id] ?? `${id}로 계속하기`}
        </button>
      ))}
    </div>
  );
}
