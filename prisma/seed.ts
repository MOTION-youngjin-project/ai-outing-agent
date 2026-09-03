import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";

const connectionUrl = process.env.DATABASE_URL;

if (!connectionUrl) {
  throw new Error("DATABASE_URL이 없습니다.");
}

const url = new URL(connectionUrl);
const caPath = path.join(process.cwd(), "prisma", "ca.pem");
// ponytail: ca.pem은 Aiven 운영 DB 전용 인증서라 로컬 개발 DB에는 없는 게 정상 —
// 없으면 SSL 없이 접속한다 (src/lib/prisma.ts와 동일한 폴백).
const ssl = fs.existsSync(caPath) ? { ca: fs.readFileSync(caPath, "utf8"), rejectUnauthorized: true } : undefined;

const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  ssl,
});

const prisma = new PrismaClient({ adapter });

const dataSources = [
  {
    code: "AIRKOREA",
    name: "에어코리아",
    sourceType: "open_api",
  },
  {
    code: "KMA",
    name: "기상청",
    sourceType: "open_api",
  },
  {
    code: "CULTURE_PORTAL",
    name: "문화포털",
    sourceType: "open_api",
  },
  {
    code: "PLACE_SEARCH",
    name: "장소 검색 API",
    sourceType: "search_api",
  },
  {
    code: "DAEGU_PARKING",
    name: "대구광역시 주차정보",
    sourceType: "open_api",
  },
  {
    code: "RAG",
    name: "내부 RAG 문서",
    sourceType: "vector_store",
  },
];

for (const source of dataSources) {
  await prisma.dataSource.upsert({
    where: { code: source.code },
    update: source,
    create: source,
  });
}

console.log("data_sources 초기 데이터 입력 완료");

// 대구광역시 + 9개 구/군. regionCode는 src/lib/tools/parking.ts의 DISTRICT_CODES와
// 동일한 값을 재사용한다 — 대구 주차정보 API(sggCd)에서 이미 검증된 코드라
// 새로 번호를 매길 필요가 없고, 나중에 parking_lots.region_id를 구/군으로 연결할 때도
// 그대로 매칭시킬 수 있다.
const daegu = await prisma.region.upsert({
  where: { regionCode: "27" },
  update: { name: "대구광역시", level: "시도" },
  create: { regionCode: "27", name: "대구광역시", level: "시도" },
});

const daeguDistricts = [
  { code: "150", name: "중구" },
  { code: "151", name: "동구" },
  { code: "152", name: "서구" },
  { code: "153", name: "남구" },
  { code: "154", name: "북구" },
  { code: "155", name: "수성구" },
  { code: "156", name: "달서구" },
  { code: "157", name: "달성군" },
  { code: "361", name: "군위군" },
];

for (const d of daeguDistricts) {
  await prisma.region.upsert({
    where: { regionCode: d.code },
    update: { name: d.name, level: "구군", parentId: daegu.id },
    create: { regionCode: d.code, name: d.name, level: "구군", parentId: daegu.id },
  });
}

console.log("regions 초기 데이터(대구광역시 + 9개 구/군) 입력 완료");

await prisma.$disconnect();
