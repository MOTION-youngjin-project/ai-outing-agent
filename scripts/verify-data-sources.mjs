import "dotenv/config";
import fs from "node:fs";
import mariadb from "mariadb";

const url = new URL(process.env.DATABASE_URL);
const ca = fs.readFileSync(new URL("../prisma/ca.pem", import.meta.url), "utf8");
const connection = await mariadb.createConnection({
  host: url.hostname,
  port: Number(url.port),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  ssl: { ca, rejectUnauthorized: true },
});

try {
  const columns = await connection.query("SHOW COLUMNS FROM data_sources");
  for (const column of columns) {
    console.log(`${column.Field}\t${column.Type}\t${column.Null}\t${column.Key}\t${column.Default ?? "NULL"}\t${column.Extra}`);
  }
} finally {
  await connection.end();
}
