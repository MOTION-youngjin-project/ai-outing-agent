import fs from "node:fs";
import path from "node:path";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../../generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const connectionUrl = process.env.DATABASE_URL;
  if (!connectionUrl) throw new Error("DATABASE_URL이 설정되지 않았습니다.");

  const url = new URL(connectionUrl);
  const caPath = path.join(process.cwd(), "prisma", "ca.pem");
  // ponytail: prisma/ca.pem은 DB가 TLS를 요구할 때만 두는 인증서라 없는 게 기본 —
  // 없으면 SSL 없이 접속한다. ca.pem이 있는 환경에서는 기존 SSL 접속 동작이 그대로다.
  const ssl = fs.existsSync(caPath) ? { ca: fs.readFileSync(caPath, "utf8"), rejectUnauthorized: true } : undefined;
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl,
    connectionLimit: 5,
  });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
