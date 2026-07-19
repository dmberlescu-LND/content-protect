import assert from "node:assert/strict";
import {
  DATABASE_BACKUP_CIPHER,
  DATABASE_BACKUP_KIND,
  databaseBackupEncryptionKey,
  databaseBackupObjectKeys,
  postgresCommandEnvironment,
  safeDatabaseManifestKey,
  validateDatabaseBackupManifest,
} from "../database-backup-policy.mjs";

assert.equal(databaseBackupEncryptionKey("x".repeat(32)).length, 32);
assert.throws(
  () => databaseBackupEncryptionKey("too-short"),
  /at least 32 characters/,
);

const snapshotId =
    "2026-07-19T16-30-00-000Z-12345678-1234-1234-1234-123456789abc",
  keys = databaseBackupObjectKeys({ tier: "daily", snapshotId });
assert.deepEqual(keys, {
  archiveKey: `content-protect-database/daily/${snapshotId}/database.dump.enc`,
  manifestKey: `content-protect-database/daily/${snapshotId}/manifest.json`,
});
assert.equal(safeDatabaseManifestKey(keys.manifestKey), keys.manifestKey);
assert.throws(() => safeDatabaseManifestKey("../manifest.json"), /Invalid/);

const payload = {
  kind: DATABASE_BACKUP_KIND,
  tier: "daily",
  snapshotId,
  backupStorageIdentity: "0123456789abcdef",
  sourceIdentity: "fedcba9876543210",
  archiveObjectKey: keys.archiveKey,
  encryptedSize: 1024,
  encryptedSha256: "a".repeat(64),
  encryption: {
    algorithm: DATABASE_BACKUP_CIPHER,
    iv: "b".repeat(24),
    authTag: "c".repeat(32),
  },
  requiredMigration: "015_operational_evidence.sql",
  tables: { users: { count: 0, sampleSize: 0, sampleHmac: "d".repeat(64) } },
};
assert.equal(
  validateDatabaseBackupManifest(payload, "0123456789abcdef"),
  payload,
);
for (const unsafe of [
  { archiveObjectKey: "another.dump" },
  { encryptedSize: 0 },
  { encryptedSha256: "invalid" },
  { encryption: { ...payload.encryption, authTag: "short" } },
  { backupStorageIdentity: "another-identity" },
])
  assert.throws(
    () =>
      validateDatabaseBackupManifest(
        { ...payload, ...unsafe },
        "0123456789abcdef",
      ),
    /invalid|another backup bucket/i,
  );

const commandEnvironment = postgresCommandEnvironment(
  "postgresql://backup%40user:p%40ssword@db.example:5433/content%2Dprotect?sslmode=verify-full",
  { PATH: "/usr/bin" },
);
assert.deepEqual(commandEnvironment, {
  PATH: "/usr/bin",
  PGHOST: "db.example",
  PGPORT: "5433",
  PGDATABASE: "content-protect",
  PGUSER: "backup@user",
  PGPASSWORD: "p@ssword",
  PGSSLMODE: "verify-full",
});

console.log(
  JSON.stringify({
    ok: true,
    encryptedArchiveRequired: true,
    manifestBoundToBucketAndObject: true,
    unsafeManifestKeysRejected: true,
    databaseCredentialsExcludedFromArguments: true,
  }),
);
