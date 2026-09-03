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
  const tables = await connection.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );
  const foreignKeys = await connection.query(
    `SELECT COUNT(*) AS count
       FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE() AND constraint_type = 'FOREIGN KEY'`,
  );
  const appTables = tables.map((row) => row.TABLE_NAME ?? row.table_name).filter((name) => name !== "_prisma_migrations");
  console.log(`APP_TABLE_COUNT=${appTables.length}`);
  console.log(`FOREIGN_KEY_COUNT=${foreignKeys[0].count}`);
  console.log(appTables.join("\n"));
} finally {
  await connection.end();
}
