import { createHash } from "node:crypto";
import pg from "pg";
import { REQUIRED_MIGRATION } from "./operations-readiness.mjs";

export const BACKUP_TABLES = Object.freeze([
  { name: "users", key: "id" },
  { name: "creator_profiles", key: "user_id" },
  { name: "verification_records", key: "id" },
  { name: "consent_records", key: "id" },
  { name: "assets", key: "id" },
  { name: "scans", key: "id" },
  { name: "matches", key: "id" },
  { name: "takedown_cases", key: "id" },
  { name: "case_events", key: "id" },
  { name: "audit_events", key: "id" },
  { name: "subscriptions", key: "id" },
  { name: "billing_consents", key: "id" },
  { name: "accounting_records", key: "id" },
  { name: "operational_evidence", key: "id" },
  { name: "object_deletion_queue", key: "id" },
  { name: "security_incidents", key: "id" },
  { name: "security_incident_events", key: "id" },
  { name: "consumer_cases", key: "id" },
  { name: "consumer_case_events", key: "id" },
]);

export function databaseIdentity(connectionString) {
  const url = new URL(connectionString),
    identity = `${url.protocol}//${url.hostname.toLowerCase()}:${url.port || "5432"}${url.pathname}`;
  return createHash("sha256").update(identity).digest("hex").slice(0, 16);
}

export function databaseClient(connectionString) {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("A PostgreSQL connection URL is required.");
  return new pg.Client({
    connectionString,
    ssl: ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
      ? false
      : { rejectUnauthorized: false },
  });
}

export async function collectBackupSnapshot(
  client,
  evidenceKey,
  { manageTransaction = true } = {},
) {
  if (manageTransaction)
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
  try {
    const migrationResult = await client.query(
      "SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1",
    );
    const latestMigration = migrationResult.rows[0]?.name;
    if (latestMigration !== REQUIRED_MIGRATION)
      throw new Error(
        `Database migration mismatch: expected ${REQUIRED_MIGRATION}, received ${latestMigration || "none"}.`,
      );
    const tables = {};
    for (const table of BACKUP_TABLES) {
      const result = await client.query(
        `SELECT
           (SELECT count(*)::int FROM ${table.name}) AS count,
           count(*)::int AS sample_size,
           encode(hmac(coalesce(string_agg(row_hmac,'' ORDER BY row_key),''),$1,'sha256'),'hex') AS sample_hmac
         FROM (
           SELECT ${table.key}::text AS row_key,
             encode(hmac(to_jsonb(source_row)::text,$1,'sha256'),'hex') AS row_hmac
           FROM ${table.name} AS source_row
           ORDER BY ${table.key}
           LIMIT 25
         ) AS sample`,
        [evidenceKey],
      );
      tables[table.name] = {
        count: Number(result.rows[0].count),
        sampleSize: Number(result.rows[0].sample_size),
        sampleHmac: result.rows[0].sample_hmac,
      };
    }
    if (manageTransaction) await client.query("COMMIT");
    return { requiredMigration: latestMigration, tables };
  } catch (error) {
    if (manageTransaction) await client.query("ROLLBACK");
    throw error;
  }
}
