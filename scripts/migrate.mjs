import { readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql = await readFile(
  new URL("../db/migrations/001_production_schema.sql", import.meta.url),
  "utf8",
);
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query(sql);
  const result = await client.query(
    "select count(*)::int as count from information_schema.tables where table_schema='public'",
  );
  console.log(
    `Database migration complete: ${result.rows[0].count} public tables.`,
  );
} finally {
  await client.end();
}
