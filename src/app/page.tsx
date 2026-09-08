import { listSidoRegions } from "@/lib/services/shared";
import { HomeClient } from "@/components/HomeClient";

// 홈만 SSR — 시/도 목록을 서버에서 미리 조회해 내려줘서 첫 로딩 깜빡임을 없앤다.
// 나머지 폼 상태/추천 요청은 전부 클라이언트(HomeClient)에서 처리한다.
export default async function Home() {
  const initialRegions = await listSidoRegions();
  return <HomeClient initialRegions={initialRegions} />;
}
