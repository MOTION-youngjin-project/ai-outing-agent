import { listSidoRegions } from "@/lib/services/shared";
import { HomeClient } from "@/components/HomeClient";

// DB를 직접 조회하는 서버 컴포넌트라 Next.js가 정적 분석만으론 이걸 못 알아채고 빌드 시점에
// 정적 프리렌더를 시도한다 — CI처럼 빌드 시 실제 DB가 없는 환경에서 그러면 연결 타임아웃으로
// 빌드 자체가 실패한다(2026-09-08 CI에서 실측). 요청마다 새로 렌더해야 하는 페이지이기도
// 하니(지역 목록이 요청 시점 기준으로 최신이어야 함) 강제로 동적 렌더링으로 고정한다.
export const dynamic = "force-dynamic";

// 홈만 SSR — 시/도 목록을 서버에서 미리 조회해 내려줘서 첫 로딩 깜빡임을 없앤다.
// 나머지 폼 상태/추천 요청은 전부 클라이언트(HomeClient)에서 처리한다.
export default async function Home() {
  const initialRegions = await listSidoRegions();
  return <HomeClient initialRegions={initialRegions} />;
}
