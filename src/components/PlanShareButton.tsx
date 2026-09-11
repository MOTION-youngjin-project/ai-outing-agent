"use client";

import { useState } from "react";
import type { Recommendation } from "@/lib/agent";
import { buildSharePlanText } from "@/lib/share-plan";

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

  const feedback = {
    idle: "모바일 공유 목록에서 카카오톡을 선택할 수 있어요.",
    shared: "공유할 앱으로 계획을 전달했습니다.",
    copied: "계획을 복사했습니다. 카카오톡 대화창에 붙여넣어 주세요.",
    failed: "자동 복사가 막혀 있습니다. 브라우저의 클립보드 권한을 확인해 주세요.",
  }[shareState];

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">같이 갈 사람에게 계획 보내기</div>
          <p aria-live="polite" className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">{feedback}</p>
        </div>
        <button
          type="button"
          onClick={sharePlan}
          className="shrink-0 rounded-xl bg-[#FEE500] px-4 py-2.5 text-sm font-semibold text-[#191919] shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 active:translate-y-0 motion-reduce:transition-none"
        >
          계획 공유하기
        </button>
      </div>
    </div>
  );
}
