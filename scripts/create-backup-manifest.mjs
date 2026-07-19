import {
  BACKUP_MANIFEST_VERSION,
  signBackupManifest,
} from "../backup-restore-policy.mjs";
import {
  collectBackupSnapshot,
  databaseClient,
  databaseIdentity,
} from "../backup-snapshot.mjs";

const connectionString = process.env.DATABASE_URL,
  evidenceKey = process.env.BACKUP_EVIDENCE_KEY;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const client = databaseClient(connectionString);
await client.connect();
try {
  const snapshot = await collectBackupSnapshot(client, evidenceKey),
    payload = {
      version: BACKUP_MANIFEST_VERSION,
      createdAt: new Date().toISOString(),
      sourceIdentity: databaseIdentity(connectionString),
      ...snapshot,
    };
  console.log(
    JSON.stringify(signBackupManifest(payload, evidenceKey), null, 2),
  );
} finally {
  await client.end();
}
