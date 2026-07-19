import assert from "node:assert/strict";
import {
  MEDIA_BACKUP_KIND,
  backupObjectStorageConfiguration,
  mediaBackupConfiguration,
  mediaBackupObjectKey,
  mediaSnapshotPrefix,
  safeMediaManifestKey,
  safeMediaObjectKey,
  storageIdentity,
  validateMediaBackupLifecycle,
  validateMediaManifest,
} from "../media-backup-policy.mjs";

const env = {
    OBJECT_STORAGE_ENDPOINT: "https://primary.r2.cloudflarestorage.com",
    OBJECT_STORAGE_BUCKET: "content-protect-primary",
    OBJECT_STORAGE_REGION: "auto",
    OBJECT_STORAGE_ACCESS_KEY_ID: "primary-access",
    OBJECT_STORAGE_SECRET_ACCESS_KEY: "primary-secret",
    BACKUP_OBJECT_STORAGE_ENDPOINT: "https://backup.r2.cloudflarestorage.com",
    BACKUP_OBJECT_STORAGE_BUCKET: "content-protect-backup",
    BACKUP_OBJECT_STORAGE_REGION: "auto",
    BACKUP_OBJECT_STORAGE_ACCESS_KEY_ID: "backup-access",
    BACKUP_OBJECT_STORAGE_SECRET_ACCESS_KEY: "backup-secret",
  },
  configuration = mediaBackupConfiguration(env),
  backupIdentity = storageIdentity(configuration.backup),
  prefix = mediaSnapshotPrefix({
    tier: "daily",
    snapshotId: "2026-07-19T12-00-00-000Z-12345678",
  }),
  backupKey = mediaBackupObjectKey(prefix, "creator/asset.vault");

assert.equal(configuration.source.bucket, "content-protect-primary");
assert.equal(
  backupObjectStorageConfiguration(env).bucket,
  "content-protect-backup",
);
assert.notEqual(
  storageIdentity(configuration.source),
  storageIdentity(configuration.backup),
);
assert.equal(backupKey, `${prefix}/objects/creator/asset.vault`);
assert.throws(() => safeMediaObjectKey("../asset.vault"), /Unsafe/);
assert.throws(() => safeMediaObjectKey("/asset.vault"), /Unsafe/);
assert.equal(
  safeMediaManifestKey(`${prefix}/manifest.json`),
  `${prefix}/manifest.json`,
);
assert.throws(
  () => safeMediaManifestKey(`${prefix}/objects/asset.vault`),
  /Invalid media backup manifest key/,
);
assert.throws(
  () =>
    mediaBackupConfiguration({
      ...env,
      BACKUP_OBJECT_STORAGE_ENDPOINT: env.OBJECT_STORAGE_ENDPOINT,
      BACKUP_OBJECT_STORAGE_BUCKET: env.OBJECT_STORAGE_BUCKET,
    }),
  /must differ/,
);

const payload = {
  kind: MEDIA_BACKUP_KIND,
  tier: "daily",
  snapshotId: "2026-07-19T12-00-00-000Z-12345678",
  backupStorageIdentity: backupIdentity,
  objectCount: 1,
  objects: [
    {
      originalObjectKey: "creator/asset.vault",
      backupObjectKey: backupKey,
      encryptedSize: 100,
      encryptedSha256: "a".repeat(64),
    },
  ],
};
assert.equal(validateMediaManifest(payload, backupIdentity), payload);
assert.throws(
  () =>
    validateMediaManifest(
      { ...payload, backupStorageIdentity: "wrong-bucket" },
      backupIdentity,
    ),
  /different backup bucket/,
);
assert.throws(
  () =>
    validateMediaManifest(
      { ...payload, objects: [...payload.objects, payload.objects[0]] },
      backupIdentity,
    ),
  /inventory is invalid/,
);
const lifecycleRules = [
  {
    Status: "Enabled",
    Filter: { Prefix: "content-protect-media/daily/" },
    Expiration: { Days: 35 },
  },
  {
    Status: "Enabled",
    Filter: { Prefix: "content-protect-media/monthly/" },
    Expiration: { Days: 400 },
  },
];
assert.deepEqual(validateMediaBackupLifecycle(lifecycleRules), {
  ok: true,
  discrepancies: [],
});
assert.equal(
  validateMediaBackupLifecycle([
    ...lifecycleRules.slice(0, 1),
    { ...lifecycleRules[1], Expiration: { Days: 30 } },
  ]).ok,
  false,
);

console.log(
  JSON.stringify({
    ok: true,
    separateBucketRequired: true,
    traversalRejected: true,
    signedInventoryShapeValidated: true,
    backupOnlyVerificationSupported: true,
    lifecycleEvidenceRequired: true,
  }),
);
