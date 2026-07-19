import {
  GetBucketLifecycleConfigurationCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { verifyBackupManifest } from "../backup-restore-policy.mjs";
import {
  backupObjectStorageConfiguration,
  safeMediaManifestKey,
  storageIdentity,
  validateMediaBackupLifecycle,
  validateMediaManifest,
} from "../media-backup-policy.mjs";

const manifestKey = safeMediaManifestKey(process.argv[2]),
  evidenceKey = process.env.BACKUP_EVIDENCE_KEY,
  backup = backupObjectStorageConfiguration(),
  backupIdentity = storageIdentity(backup),
  client = new S3Client({
    region: backup.region,
    endpoint: backup.endpoint,
    credentials: {
      accessKeyId: backup.accessKeyId,
      secretAccessKey: backup.secretAccessKey,
    },
  }),
  startedAt = new Date().toISOString();

try {
  const lifecycleResponse = await client.send(
      new GetBucketLifecycleConfigurationCommand({ Bucket: backup.bucket }),
    ),
    lifecycle = validateMediaBackupLifecycle(lifecycleResponse.Rules, {
      dailyDays: Number(process.env.MEDIA_DAILY_RETENTION_DAYS || 35),
      monthlyDays: Number(process.env.MEDIA_MONTHLY_RETENTION_DAYS || 400),
    });
  if (!lifecycle.ok)
    throw new Error(
      `Backup lifecycle configuration mismatch: ${JSON.stringify(lifecycle.discrepancies)}.`,
    );
  const manifestResponse = await client.send(
      new GetObjectCommand({ Bucket: backup.bucket, Key: manifestKey }),
    ),
    manifestBytes = Buffer.from(
      await manifestResponse.Body.transformToByteArray(),
    );
  if (manifestBytes.length > 10_000_000)
    throw new Error("The media backup manifest exceeds the safety limit.");
  const signed = JSON.parse(manifestBytes.toString("utf8")),
    payload = validateMediaManifest(
      verifyBackupManifest(signed, evidenceKey),
      backupIdentity,
    ),
    discrepancies = [];
  for (const item of payload.objects) {
    try {
      const response = await client.send(
          new GetObjectCommand({
            Bucket: backup.bucket,
            Key: item.backupObjectKey,
          }),
        ),
        encrypted = Buffer.from(await response.Body.transformToByteArray()),
        checksum = createHash("sha256").update(encrypted).digest("hex");
      if (
        encrypted.length !== item.encryptedSize ||
        checksum !== item.encryptedSha256
      )
        discrepancies.push({
          assetId: item.assetId,
          error: "checksum-mismatch",
        });
    } catch (error) {
      discrepancies.push({
        assetId: item.assetId,
        error: error instanceof Error ? error.name : "read-failed",
      });
    }
  }
  const evidence = {
    ok: discrepancies.length === 0,
    snapshotId: payload.snapshotId,
    tier: payload.tier,
    objectCount: payload.objectCount,
    objectsVerified: payload.objectCount - discrepancies.length,
    discrepancies,
    manifestCreatedAt: payload.createdAt,
    lifecycleVerified: true,
    startedAt,
    completedAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(evidence, null, 2));
  if (!evidence.ok) process.exitCode = 1;
} finally {
  client.destroy();
}
