import { Icon } from "@/components/Icon";
import type { ProgressStep } from "@/hooks/useRecommendationFlow";

// 추천을 기다리는 동안 "지금 무슨 단계인지"를 보여주는 패널.
//
// "노플랜도 플랜이 된다"를 이 목록의 왼쪽 레일 자체로 보여준다.
//  - 지금 하고 있는 단계의 슬롯은 아직 자리를 못 잡은 듯 살짝 기운 채 흔들린다.
//  - 끝나는 순간 똑바로 서며 레일에 박히고(체크), 다음 단계까지 이어지는 선이
//    점선에서 실선으로 위→아래로 그어진다.
//  - 끝난 단계가 쌓일수록 레일이 한 줄의 실선이 된다 = 흩어진 질문이 코스가 된다.
// 예전엔 이 목록 위에 따로 가로 띠(조각이 줄에 붙는 장면)를 두었는데, 같은 정보를
// 두 번 그린 셈이라 뜻 없는 진행 막대처럼 보였다 — 목록 하나로 합쳤다.
//
// 진행률(%)이나 남은 단계 수는 만들지 않는다 — 서버는 "지금 이걸 시작했다/끝났다"만
// 알려주고 전체가 몇 단계인지는 모델이 도구를 몇 번 부르냐에 따라 매번 다르다.
export function RecommendProgress({ steps }: { steps: ProgressStep[] }) {
  // 진행 중인 단계 문구를 스크린리더에 한 번만 읽힌다(줄마다 aria-live를 걸면 겹쳐 읽는다).
  const current = steps.find((s) => !s.done);

  return (
    <div className="sk-panel sk-scan sk-enter px-4 py-3.5" role="status" aria-label="추천 준비 중">
      <span className="sr-only" aria-live="polite">
        {current?.label ?? "추천 준비 중"}
      </span>
      {/* 이 패널이 무엇을 하는 중인지 한 줄로 — 단계 이름만 있으면 "왜 이걸 보고
          있는지"가 안 읽힌다. */}
      <p className="sk-cap sk-progress-cap text-[12px] font-semibold text-muted" aria-hidden>
        질문을 코스로 정리하는 중
      </p>
      <div className="flex flex-col" aria-hidden>
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          return (
            // min-h는 레일의 선이 보일 높이를 확보하려고 준다 — 슬롯(28)+간격(6)을
            // 빼고 남는 만큼이 선 길이다.
            <div key={step.key} className={`sk-enter flex gap-3 ${isLast ? "" : "min-h-[46px]"}`}>
              <div className="flex w-7 shrink-0 flex-col items-center">
                {/* 자리: 안 끝났으면 기운 채 흔들리고, 끝나면 똑바로 선다 */}
                <span className="sk-step-seat" data-set={step.done ? "1" : "0"}>
                  <span className={`sk-slot h-7 w-7 ${step.done ? "" : "sk-slot-on"}`}>
                    <Icon name={step.done ? "check" : step.icon} className="h-3.5 w-3.5" />
                  </span>
                </span>
                {!isLast && (
                  // 이 단계를 지나왔으면 다음 단계까지 실선으로 이어진다
                  <span className="sk-step-link" data-set={step.done ? "1" : "0"} />
                )}
              </div>

              <div className={`flex min-w-0 flex-1 items-center gap-2 ${isLast ? "py-1" : "pb-3 pt-1"}`}>
                {/* key에 done을 섞어서 단계가 끝나는 순간 한 번 다시 마운트시킨다 —
                    sk-swap(위로 밀려 올라오며 교체)이 그때 한 번 돈다. */}
                <p
                  key={`${step.key}-${step.done}`}
                  className={`sk-swap min-w-0 flex-1 text-[14px] leading-snug ${
                    step.done ? "text-muted" : "font-semibold text-ink"
                  }`}
                >
                  {step.label}
                </p>
                {!step.done && <span className="sk-dot" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
