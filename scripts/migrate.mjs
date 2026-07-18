import { readFile, readdir } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const migrationDirectory = new URL("../db/migrations/", import.meta.url);
const migrations = (await readdir(migrationDirectory))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});
await client.connect();
try {
  for (const migration of migrations) {
    const sql = await readFile(new URL(migration, migrationDirectory), "utf8");
    await client.query(sql);
    console.log(`Applied ${migration}`);
  }
  const result = await client.query(
    "select count(*)::int as count from information_schema.tables where table_schema='public'",
  );
  console.log(
    `Database migration complete: ${migrations.length} migrations, ${result.rows[0].count} public tables.`,
  );
} finally {
  await client.end();
}
