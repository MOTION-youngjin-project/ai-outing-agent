import { auth } from "@/lib/auth";
import { loadBalance } from "@/lib/billing/quota";
import { BillingScreen } from "@/components/screens/BillingScreen";

// Prisma를 직접 조회하는 서버 컴포넌트 — 정적 프리렌더를 시도하면 빌드 시 DB가 없는
// 환경에서 빌드가 통째로 실패한다(홈/page.tsx와 같은 이유).
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const session = await auth();
  // 이 페이지 자체가 proxy.ts 로그인 게이트 뒤에 있어서 userId는 항상 있다.
  // 자동충전은 시도하지 않는다 — 이 화면을 열어보는 것만으로 카드가 긁히면 안 된다.
  const balance = await loadBalance(session!.user!.id);
  return <BillingScreen balance={balance} />;
}
