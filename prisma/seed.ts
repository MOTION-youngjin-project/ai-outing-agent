import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";

const connectionUrl = process.env.DATABASE_URL;

if (!connectionUrl) {
  throw new Error("DATABASE_URL이 없습니다.");
}

const url = new URL(connectionUrl);

const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  allowPublicKeyRetrieval: true,
});

const prisma = new PrismaClient({ adapter });

const dataSources = [
  {
    code: "AIRKOREA",
    name: "에어코리아",
    sourceType: "open_api",
    baseUrl: "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc",
  },
  {
    code: "KMA",
    name: "기상청",
    sourceType: "open_api",
    baseUrl: "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0",
  },
  {
    code: "CULTURE_PORTAL",
    name: "문화포털",
    sourceType: "open_api",
  },
  {
    code: "PLACE_SEARCH",
    name: "NAVER API HUB 지역 검색",
    sourceType: "search_api",
    baseUrl: "https://naverapihub.apigw.ntruss.com/search/v1/local",
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

const daegu = await prisma.region.upsert({
  where: { regionCode: "27" },
  update: {
    name: "대구광역시",
    level: "sido",
    parentId: null,
  },
  create: {
    regionCode: "27",
    name: "대구광역시",
    level: "sido",
  },
});

const daeguDistricts = [
  { regionCode: "27110", name: "중구" },
  { regionCode: "27140", name: "동구" },
  { regionCode: "27170", name: "서구" },
  { regionCode: "27200", name: "남구" },
  { regionCode: "27230", name: "북구" },
  { regionCode: "27260", name: "수성구" },
  { regionCode: "27290", name: "달서구" },
  { regionCode: "27710", name: "달성군" },
  { regionCode: "27720", name: "군위군" },
];

for (const district of daeguDistricts) {
  await prisma.region.upsert({
    where: { regionCode: district.regionCode },
    update: {
      name: district.name,
      level: "sigungu",
      parentId: daegu.id,
    },
    create: {
      ...district,
      level: "sigungu",
      parentId: daegu.id,
    },
  });
}

await prisma.$disconnect();

console.log("data_sources 및 regions 초기 데이터 입력 완료");
