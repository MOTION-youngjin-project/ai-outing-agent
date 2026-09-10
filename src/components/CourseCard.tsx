import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { RecommendResult, WeatherInfo, AirQualityInfo } from "@/lib/clientApi";

// 디자인팀 목업(디자인/채팅.png)의 "오늘의 추천 코스" 카드. 목업은 장소별 정확한 방문
// 시각/코스 총 소요시간·총비용까지 보여주지만, 지금 agent.ts가 실제로 만들어주는
// 데이터엔 그런 필드가 없다. 이동수단·시간은 네이버 Directions로 구간별(자동차)
// travelDurationMin을 채워 연결선에 표시한다 — 지어내지 않는다는 이 프로젝트 원칙
// (agent.ts 시스템 프롬프트 "모르면 비워라")에 따라 값이 없는 구간은 표시하지 않는다.
export function CourseCard({
  recommendation,
  regionName,
  weather,
  airQuality,
  onOpenDetail,
}: {
  recommendation: RecommendResult;
  regionName?: string;
  weather?: WeatherInfo | null;
  airQuality?: AirQualityInfo | null;
  onOpenDetail: () => void;
}) {
  const places = recommendation.places ?? [];
  const allTags = Array.from(new Set(places.flatMap((p) => p.tags ?? [])));

  return (
    <div className="rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(17,24,39,0.06)]">
      <div className="flex flex-wrap items-center gap-1.5">
        <h3 className="mr-1 text-[15px] font-bold text-ink">오늘의 추천 코스</h3>
        {regionName && (
          <span className="flex items-center gap-1 rounded-full bg-page px-2.5 py-1 text-[11px] font-medium text-ink-soft">
            <Icon name="pin" className="h-3 w-3 text-accent" />
            {regionName}
          </span>
        )}
        {airQuality && (
          <span className="flex items-center gap-1 rounded-full bg-page px-2.5 py-1 text-[11px] font-medium text-ink-soft">
            <Icon name="dust" className="h-3 w-3 text-mint-mid" />
            미세먼지 {airQuality.overallGrade}
          </span>
        )}
        {weather && (
          <span className="flex items-center gap-1 rounded-full bg-page px-2.5 py-1 text-[11px] font-medium text-ink-soft">
            <Icon name="sun" className="h-3 w-3 text-amber-400" />
            {weather.temperatureC !== null ? `${weather.temperatureC}°C` : weather.summary}
          </span>
        )}
      </div>

      <p className="mt-2 text-[12px] text-muted">{places.length}곳을 둘러보는 코스예요.</p>

      <div className="mt-3 flex flex-col">
        {places.map((p, i) => {
          const content = (
            <>
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- 외부 공공데이터 이미지, 도메인 사전등록 불필요한 일반 img로 처리
                <img src={p.imageUrl} alt={p.name} className="h-16 w-16 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-mint-soft">
                  <Icon name="pin" className="h-6 w-6 text-mint-mid" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-bold text-ink">{p.name}</div>
                <div className="mt-0.5 line-clamp-1 text-[12px] text-muted">{p.oneLineDescription}</div>
                {(p.visitDuration || p.fee) && (
                  <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted/80">
                    {p.visitDuration && <span>{p.visitDuration}</span>}
                    {p.fee && <span>{p.fee}</span>}
                  </div>
                )}
              </div>
            </>
          );

          return (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mint-soft text-[11px] font-bold text-mint-mid">
                  {i + 1}
                </span>
                {i < places.length - 1 && (
                  <div className="flex flex-1 flex-col items-center gap-1">
                    <span className="w-px flex-1 border-l border-dashed border-hairline" />
                    {places[i + 1].travelDurationMin != null && (
                      <span className="whitespace-nowrap text-[10px] font-medium text-muted">
                        차로 {places[i + 1].travelDurationMin}분
                      </span>
                    )}
                    <span className="w-px flex-1 border-l border-dashed border-hairline" />
                  </div>
                )}
              </div>
              {p.placeId ? (
                <Link
                  href={`/recommend/${recommendation.agentRunId}/place/${p.placeId}`}
                  className="flex flex-1 gap-3 pb-4"
                >
                  {content}
                </Link>
              ) : (
                <div className="flex flex-1 gap-3 pb-4">{content}</div>
              )}
            </div>
          );
        })}
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-hairline pt-3">
          {allTags.map((t) => (
            <span key={t} className="rounded-full bg-mint-bg px-2.5 py-1 text-[11px] font-medium text-accent">
              {t}
            </span>
          ))}
        </div>
      )}

      <button
        onClick={onOpenDetail}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-accent py-3 text-[14px] font-semibold text-white"
      >
        <Icon name="compass" className="h-4 w-4" />
        코스 상세 보기
      </button>
    </div>
  );
}
