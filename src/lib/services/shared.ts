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

export async function getOrCreateDataSource(code: string, name: string, sourceType: string) {
  return prisma.dataSource.upsert({
    where: { code },
    update: {},
    create: { code, name, sourceType },
  });
}
