"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import type { PlacePhoto as Photo } from "@/lib/place-photo";
import { Icon } from "./Icon";

// 이용 조건(라이선스·촬영자)이 확인된 사진이 있으면 출처와 함께 보여주고, 없으면 fallback
// (화면이 원래 쓰던 사진/자리표시)을 그대로 그린다 — 라이선스 사진이 없는 장소가 많아서
// fallback 없이 쓰면 대부분의 장소가 핀 아이콘만 남는다(2026-09-30 병합 시 결정).
export function PlacePhoto({ placeId, name, className = "w-[84px] shrink-0", imageClassName = "h-[60px] w-full", fallback }: {
  placeId?: string | null; name: string; className?: string; imageClassName?: string; fallback?: ReactNode;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  // 사진 조회 API가 로그인 전용이라 게스트는 부르지 않고 바로 fallback.
  const authed = useSession().status === "authenticated";
  const { data } = useQuery({
    queryKey: ["licensed-place-photo", placeId], enabled: !!placeId && authed, staleTime: 300_000, retry: false,
    queryFn: async (): Promise<Photo | null> => {
      const response = await fetch(`/api/places/${encodeURIComponent(placeId!)}/photo`);
      if (!response.ok) return null;
      return (await response.json()).photo ?? null;
    },
  });
  const photo = data && data.url !== failedUrl ? data : null;
  if (!photo && fallback !== undefined) return <>{fallback}</>;
  return <figure className={className} onClick={event => event.stopPropagation()}>
    {photo ? (
      // eslint-disable-next-line @next/next/no-img-element -- Commons thumbnail URL, no proxy or image modification.
      <img src={photo.url} alt={`${name} — ${photo.title}`} loading="lazy" referrerPolicy="no-referrer"
        onError={() => setFailedUrl(photo.url)} className={`${imageClassName} rounded-xl bg-mint-soft object-contain`} />
    ) : <div className={`${imageClassName} flex items-center justify-center rounded-xl bg-mint-soft`} role="img" aria-label={`${name}: 이용 가능한 사진 없음`}>
      <Icon name="pin" className="h-6 w-6 text-mint-mid" />
    </div>}
    {photo && <figcaption className="mt-1 break-words text-[10px] leading-tight text-muted">
      <details>
        <summary className="cursor-pointer">사진 출처·이용 조건</summary>
        <p>{photo.title} · {photo.author}</p>
        {photo.credit && <p>{photo.credit}</p>}
        <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{photo.source === "official" ? "공식 출처" : photo.source === "owner" ? "등록 사진 원본" : "Wikimedia Commons 원본"}</a>
        {" · "}<a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline">{photo.license}</a>
        <p>비율 유지 축소 표시 · 원본 링크에서 최신 정보 확인</p>
        <p>{photo.capturedAt ? `촬영일(출처 기재): ${photo.capturedAt}` : "촬영일 미상"}</p>
      </details>
    </figcaption>}
  </figure>;
}
