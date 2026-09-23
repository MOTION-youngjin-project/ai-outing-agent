"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import type { WeatherInfo } from "@/lib/clientApi";

function condition(summary: string) {
  if (/눈/.test(summary)) return { icon: "❄️", label: "눈" };
  if (/비|소나기/.test(summary)) return { icon: "🌧️", label: "비" };
  if (/흐림/.test(summary)) return { icon: "☁️", label: "흐림" };
  if (/구름/.test(summary)) return { icon: "🌤️", label: "구름많음" };
  return { icon: "☀️", label: "맑음" };
}

function hourLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { hour: "numeric", hour12: true, timeZone: "Asia/Seoul" }).format(new Date(value));
}

export function HourlyWeatherPopover({ regionName, weather }: { regionName: string; weather: WeatherInfo }) {
  const [open, setOpen] = useState(false);

  // 창이 열린 동안 뒤 본문을 흐리게 한다(globals.css .sk-under-overlay).
  // backdrop-filter만으로는 부족했다 — 크롬에서 창 뒤 글자가 번지지 않고 그대로
  // 비쳐 보였다. 뒤 요소 자체에 filter를 거는 건 환경과 상관없이 항상 먹는다.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.dataset.skOverlay = "1";
    return () => {
      delete root.dataset.skOverlay;
    };
  }, [open]);
  return <div className="relative">
    <button type="button" aria-expanded={open} aria-controls="hourly-weather-detail" onClick={() => setOpen((value) => !value)} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-medium text-ink-soft shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
      <Icon name="sun" className="h-4 w-4 text-amber-400" />
      {regionName} {weather.temperatureC !== null ? `${weather.temperatureC}°C` : weather.summary}
      <span aria-hidden="true" className={`text-[9px] text-muted transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
    </button>
    {/* 다른 창(지역 선택 등)보다 확실히 위에 뜨게 z-40. 예전엔 z-30이라 나중에 그려진
        같은 z-30 요소에 밀려서 글자가 겹쳐 보였다. 뒤에 막을 깔아 지금 이게 열려
        있다는 걸 알리고, 조형도 다른 창과 같은 sk-panel/sk-drop으로 맞춘다. */}
    {open && <button type="button" aria-label="시간별 날씨 닫기" onClick={() => setOpen(false)} className="sk-scrim fixed inset-0 z-30 cursor-default bg-ink/5" />}
    {open && <section id="hourly-weather-detail" className="sk-panel sk-glass sk-drop sk-drop-right absolute right-0 top-11 z-40 w-[min(350px,calc(100vw-40px))] p-4">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-[15px] font-bold text-ink">{regionName} 시간별 날씨</h2><p className="mt-0.5 text-[11px] text-muted">기상청 단기예보 · 앞으로 최대 12시간</p></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="시간별 날씨 닫기" className="text-lg leading-none text-muted">×</button>
      </div>
      {weather.hourly?.length ? <div className="sk-reel mt-3 gap-2 pb-1.5" aria-label="시간별 예보">
        {weather.hourly.map((item) => { const shown = condition(item.summary); return <div key={item.forecastAt} className="sk-glass-cell flex min-w-[68px] flex-col items-center rounded-xl px-2 py-2.5 text-center">
          <time dateTime={item.forecastAt} className="text-[11px] text-muted">{hourLabel(item.forecastAt)}</time>
          <span className="mt-1 text-xl" aria-hidden="true">{shown.icon}</span>
          <strong className="mt-1 text-[14px] text-ink">{item.temperatureC !== null ? `${item.temperatureC}°` : "-"}</strong>
          <span className="text-[10px] text-ink-soft">{shown.label}</span>
          {item.precipitationProbability !== null && <span className="mt-0.5 text-[10px] text-sky-600">강수 {item.precipitationProbability}%</span>}
        </div>; })}
      </div> : <p className="mt-3 text-[13px] text-muted">시간별 예보가 아직 없습니다. 다음 날씨 갱신부터 표시됩니다.</p>}
    </section>}
  </div>;
}
