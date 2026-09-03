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

// 전국 17개 시/도. regionCode는 통계청 행정표준코드(2자리). 구/군 단위는 대구만 정확한
// sggCd를 확보해서(parking.ts DISTRICT_CODES) 세분화했고, 나머지 시/도는 구/군 데이터를
// 손으로 만들면 오류 위험이 커서 시/도 단위까지만 시드한다 — 필요해지면 실제 행정구역
// 데이터로 별도 추가.
const daegu = await prisma.region.upsert({
  where: { regionCode: "27" },
  update: { name: "대구광역시", level: "시도" },
  create: { regionCode: "27", name: "대구광역시", level: "시도" },
});

const otherSido = [
  { code: "11", name: "서울특별시" },
  { code: "26", name: "부산광역시" },
  { code: "28", name: "인천광역시" },
  { code: "29", name: "광주광역시" },
  { code: "30", name: "대전광역시" },
  { code: "31", name: "울산광역시" },
  { code: "36", name: "세종특별자치시" },
  { code: "41", name: "경기도" },
  { code: "42", name: "강원특별자치도" },
  { code: "43", name: "충청북도" },
  { code: "44", name: "충청남도" },
  { code: "45", name: "전북특별자치도" },
  { code: "46", name: "전라남도" },
  { code: "47", name: "경상북도" },
  { code: "48", name: "경상남도" },
  { code: "50", name: "제주특별자치도" },
];

for (const s of otherSido) {
  await prisma.region.upsert({
    where: { regionCode: s.code },
    update: { name: s.name, level: "시도" },
    create: { regionCode: s.code, name: s.name, level: "시도" },
  });
}

console.log("regions 초기 데이터(전국 17개 시/도) 입력 완료");

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
