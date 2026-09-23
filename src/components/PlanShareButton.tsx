"use client";

import { useState } from "react";
import type { Recommendation } from "@/lib/agent";
import { buildSharePlanText } from "@/lib/share-plan";
import { Icon } from "@/components/Icon";

type ShareState = "idle" | "shared" | "copied" | "failed";

interface PlanShareButtonProps {
  recommendation: Recommendation;
  title?: string;
}

export function PlanShareButton({
  recommendation,
  title = "나들이 계획",
}: PlanShareButtonProps) {
  const [shareState, setShareState] = useState<ShareState>("idle");

  async function copyPlan(text: string) {
    await navigator.clipboard.writeText(text);
    setShareState("copied");
  }

  async function sharePlan() {
    const text = buildSharePlanText(recommendation, title);
    setShareState("idle");

    try {
      if (navigator.share) {
        await navigator.share({ title, text });
        setShareState("shared");
        return;
      }
      await copyPlan(text);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        await copyPlan(text);
      } catch {
        setShareState("failed");
      }
    }
  }

  // 한 줄에 들어가야 해서 문구를 짧게 줄였다(뜻은 그대로).
  // 버튼과 한 줄을 나눠 쓰는 자리라 잘리지 않을 길이로 줄였다(뜻은 그대로).
  const feedback = {
    idle: "카카오톡으로 보낼 수 있어요.",
    shared: "공유 앱으로 보냈어요.",
    copied: "복사했어요. 붙여넣어 주세요.",
    failed: "복사 실패 · 클립보드 권한 확인",
  }[shareState];

  // 예전엔 화면 맨 위에서 진한 노란 카드가 제일 크게 자리를 차지했다 — 보조 액션이
  // 추천 결과보다 눈에 먼저 들어오는 구조였다. 아래쪽 "다른 곳 추천" 줄과 똑같은
  // 조형(아이콘 + 한 줄 + 오른쪽 버튼)으로 낮춰서 둘이 목록을 위아래로 감싸게 한다.
  // 노랑은 카카오를 가리키는 뜻이 있으니 버튼 면에만 남긴다(SOCKET 단차·프레스는 그대로).
  return (
    <div className="sk-panel sk-enter flex items-center gap-2.5 py-1.5 pl-4 pr-1.5">
      <Icon name="share" className="h-4 w-4 shrink-0 text-accent" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-semibold text-ink">같이 갈 사람에게 보내기</span>
        <span aria-live="polite" className="truncate text-[11px] text-muted">{feedback}</span>
      </div>
      <button
        type="button"
        onClick={sharePlan}
        className="sk sk-kakao shrink-0 whitespace-nowrap px-4 py-2 text-[13px]"
      >
        공유하기
      </button>
    </div>
  );
}
