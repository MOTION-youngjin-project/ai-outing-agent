import { prisma } from "@/lib/prisma";
import { normalizeSido } from "@/lib/region";

// 시/도 단위 Region이 아직 없으면(예: 대구 외 지역 첫 요청) 그 자리에서 만든다.
// teammate 시드 데이터는 정식명칭("대구광역시")을 쓰는데 sidoName은 축약형("대구")이라
// 단순 contains로는 "충청북도".includes("충북")처럼 실패하는 도(道) 4곳이 있다 —
// normalizeSido로 양쪽을 같은 축약형으로 정규화해서 비교한다.
// regionCode는 sidoName 자체를 키로 upsert하므로 동시 요청에도 레이스 없이 안전하다
// (getOrCreateDataSource와 동일한 패턴).
export async function findOrCreateSidoRegion(sidoName: string) {
  const candidates = await prisma.region.findMany({ where: { level: "시도" } });
  const existing = candidates.find((r) => normalizeSido(r.name) === sidoName);
  if (existing) return existing;

  return prisma.region.upsert({
    where: { regionCode: sidoName },
    update: {},
    create: { regionCode: sidoName, name: sidoName, level: "시도" },
  });
}

// 홈 화면(/) 서버 컴포넌트가 시/도 목록을 SSR로 미리 내려줄 때 쓴다. /api/regions와 같은
// 조회지만, 클라이언트 컴포넌트 prop으로 그대로 넘겨야 해서(BigInt/Decimal은 서버-클라이언트
// 경계를 못 건넘) 여기서 직접 문자열로 바꿔 반환한다.
export async function listSidoRegions(): Promise<
  { id: string; parentId: string | null; name: string; level: string }[]
> {
  const rows = await prisma.region.findMany({ where: { level: "시도" }, orderBy: { name: "asc" } });
  return rows.map((r) => ({ id: r.id.toString(), parentId: r.parentId?.toString() ?? null, name: r.name, level: r.level }));
}

export async function getOrCreateDataSource(code: string, name: string, sourceType: string) {
  return prisma.dataSource.upsert({
    where: { code },
    update: {},
    create: { code, name, sourceType },
  });
}
