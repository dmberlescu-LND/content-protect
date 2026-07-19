import assert from "node:assert/strict";
import {
  BACKUP_MANIFEST_VERSION,
  compareBackupSnapshots,
  signBackupManifest,
  verifyBackupManifest,
} from "../backup-restore-policy.mjs";
import { databaseIdentity } from "../backup-snapshot.mjs";
import { REQUIRED_MIGRATION } from "../operations-readiness.mjs";

const evidenceKey = "test-only-evidence-key-with-32-characters",
  snapshot = {
    version: BACKUP_MANIFEST_VERSION,
    createdAt: "2026-07-19T12:00:00.000Z",
    sourceIdentity: "source-fingerprint",
    requiredMigration: REQUIRED_MIGRATION,
    tables: {
      users: { count: 4, sampleSize: 4, sampleHmac: "a".repeat(64) },
      assets: { count: 9, sampleSize: 9, sampleHmac: "b".repeat(64) },
    },
  },
  signed = signBackupManifest(snapshot, evidenceKey);

assert.deepEqual(verifyBackupManifest(signed, evidenceKey), snapshot);
assert.throws(
  () => verifyBackupManifest(signed, "incorrect-evidence-key-with-32-chars"),
  /signature verification failed/,
);
assert.throws(
  () =>
    verifyBackupManifest(
      {
        ...signed,
        payload: { ...signed.payload, createdAt: "2026-07-20T00:00:00.000Z" },
      },
      evidenceKey,
    ),
  /signature verification failed/,
);
assert.deepEqual(compareBackupSnapshots(snapshot, snapshot), {
  ok: true,
  discrepancies: [],
});
const mismatch = compareBackupSnapshots(snapshot, {
  ...snapshot,
  tables: {
    ...snapshot.tables,
    users: { ...snapshot.tables.users, count: 3 },
  },
});
assert.equal(mismatch.ok, false);
assert.deepEqual(mismatch.discrepancies[0], {
  field: "tables.users.count",
  expected: 4,
  actual: 3,
});
assert.equal(
  databaseIdentity("postgresql://one:secret@db.example:5432/content"),
  databaseIdentity("postgresql://two:different@db.example/content"),
);
assert.notEqual(
  databaseIdentity("postgresql://one:secret@db.example/content"),
  databaseIdentity("postgresql://one:secret@restore.example/content"),
);

console.log(
  JSON.stringify({
    ok: true,
    signedManifestRequired: true,
    tamperingRejected: true,
    isolatedTargetRequired: true,
    countsAndSamplesCompared: true,
  }),
);
