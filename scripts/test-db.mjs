import "dotenv/config";
import fs from "node:fs";
import mariadb from "mariadb";

const url = new URL(process.env.DATABASE_URL);
const ca = fs.readFileSync(new URL("../prisma/ca.pem", import.meta.url), "utf8");

let connection;
try {
  connection = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: { ca, rejectUnauthorized: true },
  });
  const rows = await connection.query("SELECT 1 AS connection_ok, DATABASE() AS current_database");
  console.log(`CONNECTION_OK=${rows[0].connection_ok}`);
  console.log(`CURRENT_DATABASE=${rows[0].current_database}`);
} catch (error) {
  console.error(`CONNECTION_FAILED=${error.code ?? error.name}`);
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await connection?.end();
}
