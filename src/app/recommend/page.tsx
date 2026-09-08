"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";

// 활성 추천(runId)이 없을 때 "추천" 탭/메뉴가 보여주는 빈 상태. 마지막 runId를 어디에도
// 들고 있지 않으므로(새로고침해도 사라지면 안 됨) 여기서 특정 결과로 리다이렉트하지 않는다.
export default function RecommendEmptyPage() {
  const router = useRouter();
  return (
    <>
      <ScreenHeader title="추천" />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-mint-bg">
          <Icon name="compass" className="h-8 w-8 text-accent" />
        </div>
        <p className="text-[15px] leading-relaxed text-muted">
          아직 추천받은 코스가 없어요.
          <br />
          홈에서 질문을 남기면 코스를 추천해드려요.
        </p>
        <button
          onClick={() => router.push("/")}
          className="rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-white"
        >
          홈에서 질문하기
        </button>
      </div>
    </>
  );
}
