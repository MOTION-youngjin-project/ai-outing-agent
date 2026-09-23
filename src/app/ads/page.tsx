import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { loadAdQuota, type Owner } from "@/lib/ads/quota";
import { GUEST_COOKIE, guestHash } from "@/lib/recommendation-owner";
import { AdsScreen } from "@/components/screens/AdsScreen";

// Prisma를 직접 조회하는 서버 컴포넌트 — 정적 프리렌더를 시도하면 빌드 시 DB가 없는
// 환경에서 빌드가 통째로 실패한다(홈/page.tsx와 같은 이유).
export const dynamic = "force-dynamic";

export default async function AdsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const sessionKeyHash = userId ? null : guestHash((await cookies()).get(GUEST_COOKIE)?.value);
  const owner: Owner = userId ? { userId } : { sessionKeyHash: sessionKeyHash ?? "" };
  const quota = await loadAdQuota(owner);
  return <AdsScreen quota={quota} />;
}
