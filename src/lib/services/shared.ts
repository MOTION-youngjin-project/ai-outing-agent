import { prisma } from "@/lib/prisma";

// 시/도 단위 Region이 아직 없으면(예: 대구 외 지역 첫 요청) 그 자리에서 만든다.
// regionCode는 teammate가 미리 seed한 행정표준코드(대구=27 등)와 충돌하지 않도록
// 이름 기준으로 먼저 찾고, 없을 때만 이름 그대로를 코드로 써서 생성한다.
// normalizeSido는 축약형("대구")을 주는데 teammate 시드 데이터는 정식명칭("대구광역시")을
// 쓰므로, 정확히 일치가 아니라 포함 관계로 찾아야 기존 시드 행을 재사용한다.
export async function findOrCreateSidoRegion(sidoName: string) {
  const existing = await prisma.region.findFirst({
    where: { level: "sido", name: { contains: sidoName } },
  });
  if (existing) return existing;

  return prisma.region.create({
    data: { regionCode: sidoName, name: sidoName, level: "sido" },
  });
}

export async function getOrCreateDataSource(code: string, name: string, sourceType: string) {
  return prisma.dataSource.upsert({
    where: { code },
    update: {},
    create: { code, name, sourceType },
  });
}
