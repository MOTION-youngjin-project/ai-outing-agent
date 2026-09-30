"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { fetchPlacesSearch, getCurrentPosition, type PlaceResult } from "@/lib/clientApi";
import { Icon } from "@/components/Icon";

export type Origin = { latitude: number; longitude: number };

// GPS로 출발지를 얻는 로직 — DirectionsScreen/TransitScreen이 완전히 같은 흐름(마운트 시
// 1회 조회, 실패 시 재시도)을 갖고 있어서 한 곳에 모았다.
export function useOrigin() {
  const [origin, setOrigin] = useState<Origin | null | undefined>(undefined);
  useEffect(() => {
    getCurrentPosition().then(setOrigin);
  }, []);
  const retry = () => {
    setOrigin(undefined);
    getCurrentPosition().then(setOrigin);
  };
  return { origin, setOrigin, retry };
}

// GPS를 못 가져왔을 때 보여줄 안내 — "다시 시도"는 권한을 뒤늦게 허용했거나 신호가
// 일시적으로 안 잡힌 경우를, "직접 검색"은 PC 브라우저처럼 위치 자체를 못 쓰는
// 경우를 구제한다. 장소 검색(fetchPlacesSearch)은 홈 화면 "장소 검색"과 같은 API — 카카오
// 장소 검색 결과라 위경도가 이미 들어있다.
export function OriginFallback({
  onRetry,
  onManualSelect,
}: {
  onRetry: () => void;
  onManualSelect: (origin: Origin) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchMutation = useMutation({ mutationFn: fetchPlacesSearch });

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl bg-mint-bg px-4 py-3.5 text-[13px] leading-relaxed text-ink-soft">
      <div className="flex items-center gap-2">
        <Icon name="info" className="h-4 w-4 shrink-0 text-mint-mid" />
        <p className="flex-1">현재 위치를 가져올 수 없어요.</p>
        <button
          onClick={onRetry}
          className="shrink-0 rounded-full border border-hairline bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-soft"
        >
          다시 시도
        </button>
      </div>

      {!searchOpen ? (
        <button
          onClick={() => setSearchOpen(true)}
          className="self-start text-[12px] font-semibold text-accent underline-offset-2 hover:underline"
        >
          출발지를 직접 검색할게요
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) searchMutation.mutate(query.trim());
          }}
          className="flex gap-2"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="출발지 이름으로 검색 (예: 대구역)"
            className="sk-input min-w-0 flex-1 px-3.5 py-2 text-[13px] text-ink outline-none placeholder:text-muted/60"
            autoFocus
          />
          <button
            type="submit"
            disabled={searchMutation.isPending || !query.trim()}
            className="sk sk-primary shrink-0 whitespace-nowrap px-3.5 py-2 text-[13px]"
          >
            <Icon name="search" className="h-3.5 w-3.5" />
          </button>
        </form>
      )}

      {searchMutation.data && searchMutation.data.length === 0 && (
        <p className="text-[12px] text-muted">검색 결과가 없어요.</p>
      )}

      {searchMutation.data && searchMutation.data.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {searchMutation.data.map((p: PlaceResult) => (
            <li key={p.id}>
              <button
                onClick={() => onManualSelect({ latitude: p.latitude, longitude: p.longitude })}
                className="w-full rounded-xl bg-white px-3 py-2 text-left shadow-[0_1px_3px_rgba(17,24,39,0.05)]"
              >
                <span className="text-[13px] font-semibold text-ink">{p.name}</span>
                {p.roadAddress && <span className="block text-[12px] text-muted">{p.roadAddress}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
