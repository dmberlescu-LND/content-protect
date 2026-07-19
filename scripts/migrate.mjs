import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
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
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    checksum_sha256 text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  for (const migration of migrations) {
    const sql = await readFile(new URL(migration, migrationDirectory), "utf8"),
      checksum = createHash("sha256").update(sql).digest("hex"),
      existing = await client.query(
        "SELECT checksum_sha256 FROM schema_migrations WHERE name=$1",
        [migration],
      );
    if (existing.rows.length) {
      if (existing.rows[0].checksum_sha256 !== checksum)
        throw new Error(`Migration checksum mismatch: ${migration}`);
      console.log(`Verified ${migration}`);
      continue;
    }
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (name,checksum_sha256) VALUES ($1,$2)",
      [migration, checksum],
    );
    console.log(`Applied ${migration}`);
  }
  const result = await client.query(
    "select count(*)::int as count from information_schema.tables where table_schema='public'",
  );
  console.log(
    `Database migration complete: ${migrations.length} verified migrations, ${result.rows[0].count} public tables.`,
  );
} finally {
  await client.end();
}
