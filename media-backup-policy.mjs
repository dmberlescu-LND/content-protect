import { createHash } from "node:crypto";
import { objectStorageConfiguration } from "./storage.mjs";

export const MEDIA_BACKUP_KIND = "content-protect-media-backup";

function remapBackupEnvironment(env) {
  return {
    OBJECT_STORAGE_ENDPOINT: env.BACKUP_OBJECT_STORAGE_ENDPOINT,
    OBJECT_STORAGE_BUCKET: env.BACKUP_OBJECT_STORAGE_BUCKET,
    OBJECT_STORAGE_REGION: env.BACKUP_OBJECT_STORAGE_REGION,
    OBJECT_STORAGE_ACCESS_KEY_ID: env.BACKUP_OBJECT_STORAGE_ACCESS_KEY_ID,
    OBJECT_STORAGE_SECRET_ACCESS_KEY:
      env.BACKUP_OBJECT_STORAGE_SECRET_ACCESS_KEY,
  };
}

export function storageIdentity(configuration) {
  return createHash("sha256")
    .update(`${new URL(configuration.endpoint).origin}/${configuration.bucket}`)
    .digest("hex")
    .slice(0, 16);
}

export function backupObjectStorageConfiguration(env = process.env) {
  const backup = objectStorageConfiguration(remapBackupEnvironment(env));
  if (!backup.configured)
    throw new Error("Separate backup object storage must be configured.");
  return backup;
}

export function mediaBackupConfiguration(env = process.env) {
  const source = objectStorageConfiguration(env),
    backup = backupObjectStorageConfiguration(env);
  if (!source.configured)
    throw new Error("Primary private object storage must be configured.");
  if (storageIdentity(source) === storageIdentity(backup))
    throw new Error(
      "The media backup bucket must differ from the primary bucket.",
    );
  return { source, backup };
}

export function safeMediaObjectKey(value) {
  const key = String(value || "");
  if (
    !key ||
    key.length > 900 ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.split("/").includes("..")
  )
    throw new Error("Unsafe media object key.");
  return key;
}

export function mediaSnapshotPrefix({ tier, snapshotId }) {
  if (!["daily", "monthly"].includes(tier))
    throw new Error("MEDIA_BACKUP_TIER must be daily or monthly.");
  if (!/^[A-Za-z0-9._-]{20,120}$/.test(snapshotId))
    throw new Error("Invalid media backup snapshot identifier.");
  return `content-protect-media/${tier}/${snapshotId}`;
}

export function mediaBackupObjectKey(prefix, originalObjectKey) {
  return `${prefix}/objects/${safeMediaObjectKey(originalObjectKey)}`;
}

export function safeMediaManifestKey(value) {
  const key = safeMediaObjectKey(value);
  if (
    !/^content-protect-media\/(daily|monthly)\/[A-Za-z0-9._-]{20,120}\/manifest\.json$/.test(
      key,
    )
  )
    throw new Error("Invalid media backup manifest key.");
  return key;
}

export function validateMediaManifest(payload, backupIdentity) {
  if (payload?.kind !== MEDIA_BACKUP_KIND)
    throw new Error(
      "The signed manifest is not a Content Protect media backup.",
    );
  if (payload.backupStorageIdentity !== backupIdentity)
    throw new Error("The manifest belongs to a different backup bucket.");
  if (
    !Array.isArray(payload.objects) ||
    payload.objectCount !== payload.objects.length
  )
    throw new Error("The media backup manifest object inventory is invalid.");
  const prefix = mediaSnapshotPrefix({
      tier: payload.tier,
      snapshotId: payload.snapshotId,
    }),
    backupKeys = new Set();
  for (const item of payload.objects) {
    safeMediaObjectKey(item.originalObjectKey);
    safeMediaObjectKey(item.backupObjectKey);
    if (
      backupKeys.has(item.backupObjectKey) ||
      item.backupObjectKey !==
        mediaBackupObjectKey(prefix, item.originalObjectKey) ||
      !/^[a-f0-9]{64}$/.test(item.encryptedSha256 || "") ||
      !Number.isSafeInteger(item.encryptedSize) ||
      item.encryptedSize < 1
    )
      throw new Error("The media backup manifest contains an invalid object.");
    backupKeys.add(item.backupObjectKey);
  }
  return payload;
}

export function lifecycleRetentionDays(rules, prefix) {
  const rule = (rules || []).find(
    (candidate) =>
      candidate.Status === "Enabled" &&
      (candidate.Filter?.Prefix ?? candidate.Prefix) === prefix,
  );
  return Number.isInteger(rule?.Expiration?.Days) ? rule.Expiration.Days : null;
}

export function validateMediaBackupLifecycle(
  rules,
  { dailyDays = 35, monthlyDays = 400 } = {},
) {
  const expected = [
      { prefix: "content-protect-media/daily/", days: dailyDays },
      { prefix: "content-protect-media/monthly/", days: monthlyDays },
    ],
    discrepancies = expected
      .map((item) => ({
        ...item,
        actual: lifecycleRetentionDays(rules, item.prefix),
      }))
      .filter((item) => item.actual !== item.days);
  return { ok: discrepancies.length === 0, discrepancies };
}
