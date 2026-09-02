import { prisma } from "@/lib/prisma";

// 시/도 단위 Region이 아직 없으면(예: 대구 외 지역 첫 요청) 그 자리에서 만든다.
// regionCode는 teammate가 미리 seed한 행정표준코드(대구=27 등)와 충돌하지 않도록
// 이름 기준으로 먼저 찾고, 없을 때만 이름 그대로를 코드로 써서 생성한다.
export async function findOrCreateSidoRegion(sidoName: string) {
  const existing = await prisma.region.findFirst({
    where: { name: sidoName, level: "시도" },
  });
  if (existing) return existing;

  return prisma.region.create({
    data: { regionCode: sidoName, name: sidoName, level: "시도" },
  });
}

export async function getOrCreateDataSource(code: string, name: string, sourceType: string) {
  return prisma.dataSource.upsert({
    where: { code },
    update: {},
    create: { code, name, sourceType },
  });
}
