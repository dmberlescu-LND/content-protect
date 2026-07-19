import { readFile } from "node:fs/promises";
import {
  compareBackupSnapshots,
  verifyBackupManifest,
} from "../backup-restore-policy.mjs";
import {
  collectBackupSnapshot,
  databaseClient,
  databaseIdentity,
} from "../backup-snapshot.mjs";

const manifestPath = process.argv[2],
  connectionString = process.env.RESTORE_DATABASE_URL,
  evidenceKey = process.env.BACKUP_EVIDENCE_KEY,
  startedAt = new Date().toISOString();
if (!manifestPath)
  throw new Error(
    "Pass the signed backup manifest file as the first argument.",
  );
if (!connectionString)
  throw new Error(
    "RESTORE_DATABASE_URL is required; DATABASE_URL is never used.",
  );

const manifest = JSON.parse(await readFile(manifestPath, "utf8")),
  expected = verifyBackupManifest(manifest, evidenceKey),
  restoreIdentity = databaseIdentity(connectionString);
if (restoreIdentity === expected.sourceIdentity)
  throw new Error(
    "Restore verification refuses to run against the source database.",
  );

const client = databaseClient(connectionString);
await client.connect();
try {
  const restored = await collectBackupSnapshot(client, evidenceKey),
    comparison = compareBackupSnapshots(expected, restored),
    evidence = {
      ok: comparison.ok,
      manifestVersion: expected.version,
      manifestCreatedAt: expected.createdAt,
      sourceIdentity: expected.sourceIdentity,
      restoreIdentity,
      requiredMigration: restored.requiredMigration,
      tablesChecked: Object.keys(expected.tables || {}),
      discrepancies: comparison.discrepancies,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  console.log(JSON.stringify(evidence, null, 2));
  if (!comparison.ok) process.exitCode = 1;
} finally {
  await client.end();
}
