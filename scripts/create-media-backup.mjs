import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash, randomUUID } from "node:crypto";
import { closeDatabase, loadPostgresState } from "../database.mjs";
import { getEncryptedObject } from "../storage.mjs";
import {
  BACKUP_MANIFEST_VERSION,
  signBackupManifest,
} from "../backup-restore-policy.mjs";
import {
  MEDIA_BACKUP_KIND,
  mediaBackupConfiguration,
  mediaBackupObjectKey,
  mediaSnapshotPrefix,
  safeMediaObjectKey,
  storageIdentity,
} from "../media-backup-policy.mjs";

const evidenceKey = process.env.BACKUP_EVIDENCE_KEY,
  tier = process.env.MEDIA_BACKUP_TIER || "daily",
  snapshotId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`,
  prefix = mediaSnapshotPrefix({ tier, snapshotId }),
  { source, backup } = mediaBackupConfiguration(),
  backupClient = new S3Client({
    region: backup.region,
    endpoint: backup.endpoint,
    credentials: {
      accessKeyId: backup.accessKeyId,
      secretAccessKey: backup.secretAccessKey,
    },
  });

// Validate the evidence key before any backup object is written.
signBackupManifest({ version: BACKUP_MANIFEST_VERSION }, evidenceKey);

try {
  const state = await loadPostgresState();
  if (!state)
    throw new Error(
      "DATABASE_URL must reference the production PostgreSQL database.",
    );
  const objects = [];
  for (const asset of state.assets) {
    const originalObjectKey = safeMediaObjectKey(
        asset.objectKey || `${asset.id}.vault`,
      ),
      encrypted = await getEncryptedObject(originalObjectKey, "unused"),
      backupObjectKey = mediaBackupObjectKey(prefix, originalObjectKey),
      encryptedSha256 = createHash("sha256").update(encrypted).digest("hex");
    await backupClient.send(
      new PutObjectCommand({
        Bucket: backup.bucket,
        Key: backupObjectKey,
        Body: encrypted,
        ContentType: "application/octet-stream",
        Metadata: {
          encrypted: "aes-256-gcm",
          sha256: encryptedSha256,
          snapshot: snapshotId,
        },
      }),
    );
    objects.push({
      assetId: asset.id,
      originalObjectKey,
      backupObjectKey,
      encryptedSize: encrypted.length,
      encryptedSha256,
    });
  }
  const payload = {
      version: BACKUP_MANIFEST_VERSION,
      kind: MEDIA_BACKUP_KIND,
      createdAt: new Date().toISOString(),
      snapshotId,
      tier,
      sourceStorageIdentity: storageIdentity(source),
      backupStorageIdentity: storageIdentity(backup),
      objectCount: objects.length,
      objects,
    },
    manifest = signBackupManifest(payload, evidenceKey),
    manifestKey = `${prefix}/manifest.json`;
  await backupClient.send(
    new PutObjectCommand({
      Bucket: backup.bucket,
      Key: manifestKey,
      Body: JSON.stringify(manifest),
      ContentType: "application/json",
      Metadata: { complete: "true", snapshot: snapshotId, tier },
    }),
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        snapshotId,
        tier,
        manifestKey,
        objectCount: objects.length,
        completedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
} finally {
  backupClient.destroy();
  await closeDatabase();
}
