import type { WeatherInfo } from "@/lib/clientApi";

// 홈 Hero 글자 뒤에 아주 얕게 깔리는 대기 레이어.
//
// 날씨 앱처럼 보이면 실패다. 그래서 규칙을 셋 두었다.
//  1) 지금 날씨가 실제로 있을 때만 그린다 — 없으면 아예 렌더하지 않는다(지어내지 않는다).
//  2) 투명도 0.1 안쪽, 주기 14초 이상. UI보다 먼저 눈에 띄면 과한 것이다.
//  3) absolute라 자리를 차지하지 않는다 — 여백을 잡아먹지 않고 글자 뒤에만 있다.
//
// 모양은 세 갈래뿐이다(맑음 / 흐림·구름 / 비·눈). 기상청 summary 문자열을 그대로
// 읽어서 고르고, 못 알아보면 맑음으로 둔다.
function skyOf(summary: string): "sun" | "cloud" | "rain" {
  if (/비|소나기|눈|진눈깨비/.test(summary)) return "rain";
  if (/흐림|구름/.test(summary)) return "cloud";
  return "sun";
}

export function HeroAtmosphere({ weather }: { weather?: WeatherInfo | null }) {
  if (!weather?.summary) return null;
  const sky = skyOf(weather.summary);
  // 어느 날씨든 떠다니는 덩어리 셋. 비일 때만 그 위에 빗줄기 셋이 더 얹힌다.
  // 개수는 globals.css의 nth-child 규칙과 짝이 맞아야 한다(1~3 덩어리 / 4~6 빗줄기).
  const pieces = sky === "rain" ? 6 : 3;

  return (
    // 자리(좌우로 본문 여백 바깥까지, 위아래로 본문 전체)는 globals.css의
    // .sk-atmo가 들고 있다 — 유틸리티로 두면 그 값이 없을 때 0×0 상자가 된다.
    <div className="sk-atmo" data-sky={sky} aria-hidden>
      {Array.from({ length: pieces }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}
