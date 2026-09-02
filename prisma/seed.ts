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
const ca = fs.readFileSync(
  path.join(process.cwd(), "prisma", "ca.pem"),
  "utf8",
);

const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  ssl: {
    ca,
    rejectUnauthorized: true,
  },
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

await prisma.$disconnect();

console.log("data_sources 초기 데이터 입력 완료");
