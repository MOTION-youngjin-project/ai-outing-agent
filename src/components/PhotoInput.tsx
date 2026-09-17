"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { PHOTO_ACCEPT, preparePhoto, type PhotoSelection } from "@/lib/photo-input";

const button = "rounded-lg border border-accent/30 px-3 py-2 text-sm disabled:opacity-50";

type Props = { title: string; onChange?: (photo: PhotoSelection | null) => void; analysisEnabled?: boolean };

export function PhotoInput(props: Props) {
  const pathname = usePathname();
  return <PhotoInputContent key={pathname} {...props} />;
}

function PhotoInputContent({ title, onChange, analysisEnabled = false }: Props) {
  const id = useId();
  const camera = useRef<HTMLInputElement>(null);
  const album = useRef<HTMLInputElement>(null);
  const lifecycle = useRef({ mounted: false, generation: 0, url: "" });
  const [photo, setPhoto] = useState<PhotoSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const state = lifecycle.current;
    state.mounted = true;
    return () => { state.mounted = false; state.generation++; if (state.url) URL.revokeObjectURL(state.url); state.url = ""; };
  }, []);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = ""; // 같은 사진을 삭제/교체한 뒤 다시 선택할 수 있다.
    if (!files.length) return; // 시스템 선택창 취소는 기존 사진을 유지한다.
    if (files.length !== 1) { setError("사진은 한 번에 1장만 선택해 주세요."); return; }
    const state = lifecycle.current;
    const generation = ++state.generation;
    setBusy(true); setError("");
    try {
      const next = await preparePhoto(files[0]);
      if (!state.mounted || state.generation !== generation) { URL.revokeObjectURL(next.previewUrl); return; }
      if (state.url) URL.revokeObjectURL(state.url);
      state.url = next.previewUrl; setPhoto(next); onChange?.(next);
    } catch (reason) {
      if (state.mounted && state.generation === generation) setError(reason instanceof Error ? reason.message : "사진을 선택하지 못했습니다. 다시 시도해 주세요.");
    } finally { if (state.mounted && state.generation === generation) setBusy(false); }
  }
  function remove() {
    const state = lifecycle.current;
    state.generation++; if (state.url) URL.revokeObjectURL(state.url); state.url = "";
    setPhoto(null); setBusy(false); setError(""); onChange?.(null);
  }

  return <section aria-labelledby={`${id}-title`} className="my-3 space-y-3 rounded-xl border border-accent/30 bg-white p-4">
    <h3 id={`${id}-title`} className="font-semibold">{title}</h3>
    <p className="text-xs">사진 1장 · JPEG, PNG, WebP · 최대 10MB. 새 사진을 선택하면 이전 사진이 교체됩니다.</p>
    <input ref={camera} id={`${id}-camera`} aria-label={`${title} 카메라 파일`} className="sr-only" type="file" accept={PHOTO_ACCEPT} capture="environment" onChange={choose} disabled={busy} />
    <input ref={album} id={`${id}-album`} aria-label={`${title} 앨범 파일`} className="sr-only" type="file" accept={PHOTO_ACCEPT} onChange={choose} disabled={busy} />
    <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={() => camera.current?.click()}>{photo ? "다시 촬영" : "카메라로 촬영"}</button><button type="button" className={button} disabled={busy} onClick={() => album.current?.click()}>{photo ? "앨범에서 교체" : "앨범에서 선택"}</button></div>
    <p className="text-xs">카메라 지원 여부와 권한 요청은 기기·브라우저에 따라 다릅니다. 촬영이 안 되면 앨범에서 선택해 주세요.</p>
    {busy && <p role="status" className="text-sm">사진 확인 중…</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {photo && <div className="space-y-2">
      <Image src={photo.previewUrl} alt={`${title} 미리보기`} width={photo.width} height={photo.height} unoptimized className="max-h-80 w-full rounded-lg object-contain" />
      <p className="break-all text-sm">{photo.file.name}</p><p className="text-xs">{photo.width} × {photo.height} · {(photo.file.size / 1024 / 1024).toFixed(2)}MB</p>
    </div>}
    {(photo || busy) && <button type="button" className={button} onClick={remove}>{photo ? "사진 삭제" : "선택 취소"}</button>}
    <p className="text-xs">{analysisEnabled ? "사진 분석 버튼을 누르면 사진을 서버로 전송하고, 위치 등 메타데이터를 제거한 이미지를 Google Gemini로 보내 분석합니다. 앱은 사진을 파일이나 DB에 저장하지 않습니다. 외부 제공자의 데이터 처리 정책이 적용됩니다. 삭제·화면 이동·새로고침 시 이 화면의 사진은 사라집니다." : "사진은 이 화면에서만 보관하며 서버 전송·영구 저장하지 않습니다. 삭제하거나 화면을 벗어나거나 새로고침하면 사라집니다. 현재 사진은 추천에 반영되지 않습니다."}</p>
  </section>;
}
