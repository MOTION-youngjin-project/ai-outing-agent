"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { fetchSavedPlaces, fetchPreferences, putPreferences, fetchRecentQuestions } from "@/lib/clientApi";
import { extractCategoryLabel } from "@/lib/services/matching";
import { FILTER_LABELS } from "@/lib/placeTags";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { RecommendationHistory } from "@/components/RecommendationHistory";
import { useReveal, useCountUp } from "@/lib/useReveal";

// FILTER_LABELS(agent.ts의 PLACE_TAGS)와 같은 값 — 선호 조건 칩에 쓸 아이콘만 매핑.
const PREFERENCE_ICONS: Record<(typeof FILTER_LABELS)[number], string> = {
  실내: "home",
  야외: "sun",
  데이트: "heart",
  저비용: "won",
};

// 통계 한 칸 — 숫자가 0에서 실제 값까지 한 번 올라간다. 폭은 최종 자릿수로 미리
// 잡아 두어 세는 동안 가운데 정렬이 흔들리지 않는다.
function StatCell({ icon, label, value }: { icon: string; label: string; value: number }) {
  const shown = useCountUp(value);
  return (
    <div className="sk-my-stat">
      <span className="sk-my-stat-v" style={{ minWidth: `${String(value).length}ch` }}>
        {shown}
      </span>
      <span className="sk-my-stat-l">
        <Icon name={icon} className="h-3.5 w-3.5 text-mint-mid" />
        {label}
      </span>
    </div>
  );
}

function formatKoreanDateTime(iso: string): string {
  const d = new Date(iso);
  const ampm = d.getHours() < 12 ? "오전" : "오후";
  const hour12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${ampm} ${hour12}:${pad(d.getMinutes())}`;
}

export function MyPageScreen() {
  const router = useRouter();
  const auth = useSession();
  const queryClient = useQueryClient();

  // 로그인 필요 여부는 middleware.ts가 이미 서버 단에서 걸러준다 — 여긴 세션 로딩 중
  // 잠깐의 깜빡임만 막는다.
  const authed = auth.status === "authenticated";
  const savedPlacesQuery = useQuery({
    queryKey: ["saved-places"],
    queryFn: () => fetchSavedPlaces(),
    enabled: authed,
  });
  const preferencesQuery = useQuery({
    queryKey: ["preferences"],
    queryFn: fetchPreferences,
    enabled: authed,
  });
  const recentQuestionsQuery = useQuery({
    queryKey: ["recent-questions"],
    queryFn: fetchRecentQuestions,
    enabled: authed,
  });

  // 섹션마다 "화면에 들어오면 한 번" 등장(lib/useReveal — 관찰자는 앱 전체에 하나).
  const savedRef = useReveal<HTMLElement>();
  const prefRef = useReveal<HTMLElement>();
  const recentRef = useReveal<HTMLElement>();
  const settingsRef = useReveal<HTMLElement>();

  async function togglePreference(tag: (typeof FILTER_LABELS)[number]) {
    const current = preferencesQuery.data ?? [];
    const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
    queryClient.setQueryData(["preferences"], next);
    await putPreferences(next);
  }

  // 알림 설정은 뒤에 걸 기능(알림 발송) 자체가 앱에 없어서 준비 중으로 남겨둔다 —
  // onClick 없는 항목은 비활성 처리된다.
  const settingsMenu = [
    { label: "알림 설정", onClick: undefined },
    { label: "방문 예정", onClick: () => router.push("/mypage/planned") },
    { label: "앱 설정", onClick: () => router.push("/settings") },
    { label: "로그아웃", onClick: () => signOut() },
  ];

  if (auth.status !== "authenticated") return null;
  const session = auth.data;

  return (
    <div className="sk-my">
      {/* 1. 제목 + 설정 — ScreenHeader는 9개 화면이 함께 쓰는 공용 컴포넌트라
          파일은 건드리지 않고, 감싸는 칸으로만 자리를 잡는다. */}
      <div className="sk-my-head">
        <ScreenHeader
          title="마이페이지"
          right={
            <button onClick={() => router.push("/settings")} aria-label="설정" className="p-1 text-ink">
              <Icon name="gear" className="h-[22px] w-[22px]" />
            </button>
          }
        />
      </div>

      {/* 2. 프로필 + 통계 — 이 화면에서 유일하게 "면"을 가진 덩어리 */}
      <section className="sk-my-sum sk-enter" aria-label="프로필 요약">
        <div className="sk-my-sum-id">
          <div className="sk-my-avatar sk-my-av">
            <Icon name="user" className="h-6 w-6 text-mint-mid" />
          </div>
          <div className="sk-my-id min-w-0 flex-1">
            <div className="sk-my-name truncate">
              {session.user?.name || session.user?.email?.split("@")[0] || "사용자"}
            </div>
            <div className="sk-my-sub">저장한 나들이와 설정을 관리해요.</div>
          </div>
        </div>
        {/* 숫자를 위로 올려 먼저 읽히게 한다 — 라벨은 그 아래 작은 글씨 */}
        <div className="sk-my-stats">
          {[
            { icon: "pin", label: "저장한 장소", value: savedPlacesQuery.data?.length ?? 0 },
            { icon: "clock", label: "최근 추천", value: recentQuestionsQuery.data?.totalCount ?? 0 },
            // ponytail: 주차장을 따로 "저장"하는 기능 자체가 아직 없다 — 없는 걸 있는 척
            // 가짜 숫자로 보여주지 않고 정직하게 0. 기능 생기면 그때 실제 카운트로 교체.
            { icon: "parking", label: "주차 저장", value: 0 },
          ].map((stat) => (
            <StatCell key={stat.label} icon={stat.icon} label={stat.label} value={stat.value} />
          ))}
        </div>
      </section>

      {/* 3. 내 추천 기록 */}
      <RecommendationHistory userId={session.user.id} />

      {/* 4. 저장한 장소 */}
      <section ref={savedRef} data-reveal="wait" className="sk-my-sec sk-my-a-saved" aria-label="저장한 장소">
        <div className="sk-my-sec-head">
          <h2 className="sk-cap sk-my-title">저장한 장소</h2>
          <button onClick={() => router.push("/saved")} className="sk-my-more">
            전체 보기
            <Icon name="next" className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="sk-my-list">
          {savedPlacesQuery.data?.length === 0 && (
            <p className="sk-my-empty">아직 저장한 장소가 없어요.</p>
          )}
          {(savedPlacesQuery.data ?? []).map((p) => (
            <div key={p.placeId} className="sk-my-row">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- 외부 공공데이터 이미지, 도메인 사전등록 불필요한 일반 img로 처리
                <img src={p.imageUrl} alt={p.name} className="sk-my-thumb" />
              ) : (
                <div className="sk-my-thumb flex items-center justify-center bg-mint-soft">
                  <Icon name="pin" className="h-5 w-5 text-mint-mid" />
                </div>
              )}
              <div className="sk-my-row-body">
                <div className="sk-my-row-title truncate">{p.name}</div>
                <div className="sk-my-row-sub truncate">
                  {extractCategoryLabel(p.categorySummary ?? null) ?? p.roadAddress ?? ""}
                </div>
              </div>
              <Icon name="next" className="sk-my-chev" />
            </div>
          ))}
        </div>
      </section>

      {/* 5. 선호 조건 */}
      <section ref={prefRef} data-reveal="wait" className="sk-my-sec sk-my-a-pref" aria-label="선호 조건">
        <div className="sk-my-sec-head">
          <h2 className="sk-cap sk-my-title">선호 조건</h2>
        </div>
        <div className="sk-my-chips">
          {FILTER_LABELS.map((tag) => {
            const active = (preferencesQuery.data ?? []).includes(tag);
            return (
              <button
                key={tag}
                onClick={() => togglePreference(tag)}
                className={active ? "sk-my-chip sk-my-chip-on" : "sk-my-chip"}
              >
                {tag === "저비용" ? (
                  <span className="text-[13px] font-semibold text-mint-mid">₩</span>
                ) : (
                  <Icon name={PREFERENCE_ICONS[tag]} className="h-3.5 w-3.5 text-mint-mid" />
                )}
                {tag}
              </button>
            );
          })}
        </div>
      </section>

      {/* 6. 최근 질문 */}
      <section ref={recentRef} data-reveal="wait" className="sk-my-sec sk-my-a-recent" aria-label="최근 질문">
        <div className="sk-my-sec-head">
          <h2 className="sk-cap sk-my-title">최근 질문</h2>
          <span title="준비 중인 기능입니다" className="sk-my-more cursor-not-allowed opacity-70">
            전체 보기
            <Icon name="next" className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className="sk-my-list">
          {recentQuestionsQuery.data?.questions.length === 0 && (
            <p className="sk-my-empty">아직 질문 기록이 없어요.</p>
          )}
          {(recentQuestionsQuery.data?.questions ?? []).map((q) => (
            <div key={q.id} className="sk-my-row">
              <span className="sk-my-slot">
                <Icon name="sparkle" className="h-4 w-4 text-accent" />
              </span>
              <div className="sk-my-row-body">
                <div className="sk-my-row-title">{q.question}</div>
                <div className="sk-my-row-sub">{formatKoreanDateTime(q.askedAt)}</div>
              </div>
              <Icon name="next" className="sk-my-chev" />
            </div>
          ))}
        </div>
      </section>

      {/* 7. 설정 — 로그아웃·방문 예정으로 가는 유일한 입구라 그대로 둔다 */}
      <section ref={settingsRef} data-reveal="wait" className="sk-my-sec sk-my-a-set" aria-label="설정">
        <div className="sk-my-sec-head">
          <h2 className="sk-cap sk-my-title">설정</h2>
        </div>
        <div className="sk-my-list">
          {settingsMenu.map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              disabled={!item.onClick}
              title={item.onClick ? undefined : "준비 중인 기능입니다"}
              className={`sk-my-row justify-between ${item.onClick ? "" : "cursor-not-allowed opacity-70"}`}
            >
              <span className="sk-my-row-title font-medium">{item.label}</span>
              <Icon name="next" className="sk-my-chev" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
