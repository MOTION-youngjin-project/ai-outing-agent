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
    ssl: { ca, rejectUnauthorized: true },
  });
  const rows = await connection.query("SHOW DATABASES");
  for (const row of rows) console.log(row.Database);
} catch (error) {
  console.error(`LIST_DATABASES_FAILED=${error.code ?? error.name}`);
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await connection?.end();
}
