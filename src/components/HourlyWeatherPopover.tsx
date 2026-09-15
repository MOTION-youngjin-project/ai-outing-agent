"use client";

import { useState } from "react";
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
  return <div className="relative">
    <button type="button" aria-expanded={open} aria-controls="hourly-weather-detail" onClick={() => setOpen((value) => !value)} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-medium text-ink-soft shadow-[0_1px_3px_rgba(17,24,39,0.05)]">
      <Icon name="sun" className="h-4 w-4 text-amber-400" />
      {regionName} {weather.temperatureC !== null ? `${weather.temperatureC}°C` : weather.summary}
      <span aria-hidden="true" className={`text-[9px] text-muted transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
    </button>
    {open && <section id="hourly-weather-detail" className="absolute right-0 top-11 z-30 w-[min(350px,calc(100vw-40px))] rounded-2xl border border-hairline bg-white p-4 shadow-[0_10px_30px_rgba(17,24,39,0.14)]">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-[15px] font-bold text-ink">{regionName} 시간별 날씨</h2><p className="mt-0.5 text-[11px] text-muted">기상청 단기예보 · 앞으로 최대 12시간</p></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="시간별 날씨 닫기" className="text-lg leading-none text-muted">×</button>
      </div>
      {weather.hourly?.length ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="시간별 예보">
        {weather.hourly.map((item) => { const shown = condition(item.summary); return <div key={item.forecastAt} className="flex min-w-[68px] flex-col items-center rounded-xl bg-mint-bg px-2 py-2.5 text-center">
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
