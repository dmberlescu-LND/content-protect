import { createHash } from "node:crypto";
import {
  backupObjectStorageConfiguration,
  mediaBackupConfiguration,
} from "./media-backup-policy.mjs";

export const DATABASE_BACKUP_KIND = "content-protect-database-backup";
export const DATABASE_BACKUP_CIPHER = "aes-256-gcm";

export function databaseBackupEncryptionKey(value) {
  const key = String(value || "");
  if (key.length < 32)
    throw new Error(
      "BACKUP_ARCHIVE_ENCRYPTION_KEY must contain at least 32 characters.",
    );
  return createHash("sha256")
    .update(`content-protect-database-backup:${key}`)
    .digest();
}

export function databaseSnapshotPrefix({ tier, snapshotId }) {
  if (!["daily", "monthly"].includes(tier))
    throw new Error("DATABASE_BACKUP_TIER must be daily or monthly.");
  if (!/^[A-Za-z0-9._-]{20,120}$/.test(String(snapshotId || "")))
    throw new Error("Invalid database backup snapshot identifier.");
  return `content-protect-database/${tier}/${snapshotId}`;
}

export function databaseBackupObjectKeys(input) {
  const prefix = databaseSnapshotPrefix(input);
  return {
    archiveKey: `${prefix}/database.dump.enc`,
    manifestKey: `${prefix}/manifest.json`,
  };
}

export function safeDatabaseManifestKey(value) {
  const key = String(value || "");
  if (
    !/^content-protect-database\/(daily|monthly)\/[A-Za-z0-9._-]{20,120}\/manifest\.json$/.test(
      key,
    )
  )
    throw new Error("Invalid database backup manifest key.");
  return key;
}

export function databaseBackupConfiguration(
  env = process.env,
  { requirePrimarySeparation = false } = {},
) {
  const backup = requirePrimarySeparation
    ? mediaBackupConfiguration(env).backup
    : backupObjectStorageConfiguration(env);
  return {
    backup,
    encryptionKey: databaseBackupEncryptionKey(
      env.BACKUP_ARCHIVE_ENCRYPTION_KEY,
    ),
  };
}

export function validateDatabaseBackupManifest(payload, backupIdentity) {
  if (payload?.kind !== DATABASE_BACKUP_KIND)
    throw new Error("The signed manifest is not a database backup.");
  if (payload.backupStorageIdentity !== backupIdentity)
    throw new Error("The database backup belongs to another backup bucket.");
  const expected = databaseBackupObjectKeys({
    tier: payload.tier,
    snapshotId: payload.snapshotId,
  });
  if (
    payload.archiveObjectKey !== expected.archiveKey ||
    !/^[a-f0-9]{64}$/.test(payload.encryptedSha256 || "") ||
    !Number.isSafeInteger(payload.encryptedSize) ||
    payload.encryptedSize < 1 ||
    payload.encryption?.algorithm !== DATABASE_BACKUP_CIPHER ||
    !/^[a-f0-9]{24}$/.test(payload.encryption?.iv || "") ||
    !/^[a-f0-9]{32}$/.test(payload.encryption?.authTag || "") ||
    !/^[a-f0-9]{16}$/.test(payload.sourceIdentity || "") ||
    typeof payload.requiredMigration !== "string" ||
    typeof payload.tables !== "object" ||
    !payload.tables ||
    (payload.release && !/^[a-f0-9]{7,40}$/i.test(payload.release))
  )
    throw new Error("The database backup manifest is invalid.");
  return payload;
}

export function postgresCommandEnvironment(
  connectionString,
  env = process.env,
) {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("A PostgreSQL connection URL is required.");
  const sslMode = url.searchParams.get("sslmode");
  const commandEnvironment = Object.fromEntries(
    ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR"]
      .filter((key) => env[key])
      .map((key) => [key, env[key]]),
  );
  return {
    ...commandEnvironment,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE:
      sslMode ||
      (["localhost", "127.0.0.1", "::1"].includes(url.hostname)
        ? "disable"
        : "require"),
    ...(url.searchParams.get("sslrootcert")
      ? { PGSSLROOTCERT: url.searchParams.get("sslrootcert") }
      : {}),
  };
}
