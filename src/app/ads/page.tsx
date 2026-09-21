import { auth } from "@/lib/auth";
import { loadAdQuota } from "@/lib/ads/quota";
import { AdsScreen } from "@/components/screens/AdsScreen";

// Prisma를 직접 조회하는 서버 컴포넌트 — 정적 프리렌더를 시도하면 빌드 시 DB가 없는
// 환경에서 빌드가 통째로 실패한다(홈/page.tsx와 같은 이유).
export const dynamic = "force-dynamic";

export default async function AdsPage() {
  const session = await auth();
  // 이 페이지 자체가 proxy.ts 로그인 게이트 뒤에 있어서 userId는 항상 있다.
  const quota = await loadAdQuota(session!.user!.id);
  return <AdsScreen quota={quota} />;
}
