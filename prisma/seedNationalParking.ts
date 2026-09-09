import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient, type Prisma } from "../generated/prisma/client";
import { pickRegionForAddress } from "../src/lib/services/matching";

// data.go.kr "전국주차장정보표준데이터"(CSV, CP949) 일회성 import.
// https://www.data.go.kr/data/15012896/standard.do 에서 받은 파일을 CP949->UTF-8로
// 변환해 data/national-parking-standard.csv 에 둔 뒤 이 스크립트로 돌린다.
// 실시간 잔여대수는 이 데이터셋에 없다(한국교통안전공단 API 승인 후 별도 동기화).

const connectionUrl = process.env.DATABASE_URL;
if (!connectionUrl) throw new Error("DATABASE_URL이 없습니다.");

const url = new URL(connectionUrl);
const caPath = path.join(process.cwd(), "prisma", "ca.pem");
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

const SOURCE_CODE = "NATIONAL_PARKING_STANDARD";
const CSV_PATH = path.join(process.cwd(), "data", "national-parking-standard.csv");

type Row = Record<string, string>;

function formatFeeInfo(row: Row): string | null {
  if (row["요금정보"] === "무료") return "무료";
  if (row["요금정보"] !== "유료") return null;

  const parts: string[] = [];
  const baseMin = row["주차기본시간"];
  const baseFee = row["주차기본요금"];
  if (baseMin && baseFee) parts.push(`기본 ${baseMin}분 ${baseFee}원`);

  const unitMin = row["추가단위시간"];
  const unitFee = row["추가단위요금"];
  if (unitMin && unitFee) parts.push(`추가 ${unitMin}분당 ${unitFee}원`);

  const monthly = row["월정기권요금"];
  if (monthly) parts.push(`월정기권 ${monthly}원`);

  return parts.length > 0 ? parts.join(", ") : "유료";
}

function formatOperatingHours(row: Row): Prisma.InputJsonValue | null {
  if (!row["운영요일"]) return null;
  return {
    days: row["운영요일"],
    weekday: { start: row["평일운영시작시각"] || null, end: row["평일운영종료시각"] || null },
    saturday: { start: row["토요일운영시작시각"] || null, end: row["토요일운영종료시각"] || null },
    holiday: { start: row["공휴일운영시작시각"] || null, end: row["공휴일운영종료시각"] || null },
  };
}

async function main() {
  const source = await prisma.dataSource.upsert({
    where: { code: SOURCE_CODE },
    update: {},
    create: { code: SOURCE_CODE, name: "전국주차장정보표준데이터", sourceType: "standard_dataset" },
  });

  const regions = await prisma.region.findMany({ where: { level: { in: ["시도", "구군"] } } });

  const rows: Row[] = parse(fs.readFileSync(CSV_PATH, "utf-8"), {
    columns: true,
    skip_empty_lines: true,
  });

  let upserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const sourceParkingKey = row["주차장관리번호"]?.trim();
    const name = row["주차장명"]?.trim();
    const address = row["소재지도로명주소"]?.trim() || row["소재지지번주소"]?.trim();
    const latitude = Number(row["위도"]);
    const longitude = Number(row["경도"]);

    if (!sourceParkingKey || !name || !address || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      skipped++;
      continue;
    }

    const region = pickRegionForAddress(address, regions);
    const totalSpacesRaw = Number(row["주차구획수"]);

    const data = {
      sourceId: source.id,
      sourceParkingKey,
      regionId: region?.id,
      name,
      address,
      latitude,
      longitude,
      totalSpaces: Number.isFinite(totalSpacesRaw) ? totalSpacesRaw : null,
      feeInfo: formatFeeInfo(row),
      operatingHoursJson: formatOperatingHours(row) ?? undefined,
      realtimeSupported: false,
    };

    await prisma.parkingLot.upsert({
      where: { sourceId_sourceParkingKey: { sourceId: source.id, sourceParkingKey } },
      update: data,
      create: data,
    });
    upserted++;

    if (upserted % 1000 === 0) console.log(`${upserted}/${rows.length}...`);
  }

  console.log(`전국주차장정보표준데이터 시드 완료 — upsert ${upserted}건, 스킵 ${skipped}건 (전체 ${rows.length}행)`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exitCode = 1;
});
