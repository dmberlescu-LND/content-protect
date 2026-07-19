import {
  GetBucketLifecycleConfigurationCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createHash, randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

import {
  AUDIT_EXPORT_KIND,
  AUDIT_EXPORT_VERSION,
  auditExportConfiguration,
  auditExportKeys,
  decryptAuditExport,
  encryptAuditExport,
  parseAuditRecords,
  serializeAuditRecords,
  signAuditExportManifest,
  validateAuditExportLifecycle,
  verifyAuditExportManifest,
} from "../audit-export-policy.mjs";
import {
  auditExportSnapshot,
  closeDatabase,
  recordOperationalEvidence,
} from "../database.mjs";
import { REQUIRED_MIGRATION } from "../operations-readiness.mjs";

const createdAt = new Date().toISOString(),
  snapshotId = `${createdAt.replace(/[:.]/g, "-")}-${randomUUID()}`,
  release = process.env.RENDER_GIT_COMMIT?.slice(0, 40) || null;

let client;

async function bodyBuffer(response) {
  if (!response?.Body?.transformToByteArray)
    throw new Error("The retained audit object could not be read back.");
  return Buffer.from(await response.Body.transformToByteArray());
}

async function exportAndVerify() {
  const configuration = auditExportConfiguration(),
    { destination } = configuration,
    snapshot = await auditExportSnapshot(),
    jsonl = serializeAuditRecords(snapshot.records),
    compressed = gzipSync(jsonl, { level: 9, mtime: 0 }),
    encrypted = encryptAuditExport(compressed, configuration.encryptionKey),
    keys = auditExportKeys(snapshotId),
    first = snapshot.records[0] || null,
    last = snapshot.records.at(-1) || null,
    payload = {
      version: AUDIT_EXPORT_VERSION,
      kind: AUDIT_EXPORT_KIND,
      createdAt,
      snapshotId,
      destinationIdentity: configuration.destinationIdentity,
      custodyReference: configuration.custodyReference,
      recordCount: snapshot.records.length,
      firstSequence: first?.sequenceNo ?? null,
      lastSequence: last?.sequenceNo ?? null,
      firstPreviousHash: first?.previousHash ?? null,
      lastEventHash: last?.eventHash ?? null,
      jsonlSha256: createHash("sha256").update(jsonl).digest("hex"),
      compressedSize: compressed.length,
      encryptedSize: encrypted.length,
      encryptedSha256: createHash("sha256").update(encrypted).digest("hex"),
      archiveKey: keys.archiveKey,
      manifestKey: keys.manifestKey,
    },
    manifest = signAuditExportManifest(payload, configuration.evidenceKey);

  client = new S3Client({
    region: destination.region,
    endpoint: destination.endpoint,
    credentials: {
      accessKeyId: destination.accessKeyId,
      secretAccessKey: destination.secretAccessKey,
    },
  });
  const lifecycleResponse = await client.send(
      new GetBucketLifecycleConfigurationCommand({
        Bucket: destination.bucket,
      }),
    ),
    lifecycle = validateAuditExportLifecycle(lifecycleResponse.Rules || []);
  if (!lifecycle.ok)
    throw new Error(
      `Audit export lifecycle must retain ${lifecycle.expectedDays} days; found ${lifecycle.actualDays ?? "no matching rule"}.`,
    );
  await client.send(
    new PutObjectCommand({
      Bucket: destination.bucket,
      Key: keys.archiveKey,
      Body: encrypted,
      ContentType: "application/octet-stream",
      IfNoneMatch: "*",
      Metadata: {
        encrypted: "aes-256-gcm",
        snapshot: snapshotId,
        sha256: payload.encryptedSha256,
      },
    }),
  );
  await client.send(
    new PutObjectCommand({
      Bucket: destination.bucket,
      Key: keys.manifestKey,
      Body: JSON.stringify(manifest),
      ContentType: "application/json",
      IfNoneMatch: "*",
      Metadata: { complete: "true", snapshot: snapshotId },
    }),
  );

  const storedManifest = JSON.parse(
      (
        await bodyBuffer(
          await client.send(
            new GetObjectCommand({
              Bucket: destination.bucket,
              Key: keys.manifestKey,
            }),
          ),
        )
      ).toString("utf8"),
    ),
    verifiedPayload = verifyAuditExportManifest(
      storedManifest,
      configuration.evidenceKey,
    ),
    storedArchive = await bodyBuffer(
      await client.send(
        new GetObjectCommand({
          Bucket: destination.bucket,
          Key: verifiedPayload.archiveKey,
        }),
      ),
    );
  if (
    verifiedPayload.destinationIdentity !== configuration.destinationIdentity ||
    verifiedPayload.custodyReference !== configuration.custodyReference ||
    storedArchive.length !== verifiedPayload.encryptedSize ||
    createHash("sha256").update(storedArchive).digest("hex") !==
      verifiedPayload.encryptedSha256
  )
    throw new Error("Retained audit export identity or checksum is invalid.");
  const restoredJsonl = gunzipSync(
      decryptAuditExport(storedArchive, configuration.encryptionKey),
    ),
    restoredRecords = parseAuditRecords(restoredJsonl),
    restoredFirst = restoredRecords[0] || null,
    restoredLast = restoredRecords.at(-1) || null;
  if (
    createHash("sha256").update(restoredJsonl).digest("hex") !==
      verifiedPayload.jsonlSha256 ||
    restoredRecords.length !== verifiedPayload.recordCount ||
    (restoredFirst?.sequenceNo ?? null) !== verifiedPayload.firstSequence ||
    (restoredFirst?.previousHash ?? null) !==
      verifiedPayload.firstPreviousHash ||
    (restoredLast?.sequenceNo ?? null) !== verifiedPayload.lastSequence ||
    (restoredLast?.eventHash ?? null) !== verifiedPayload.lastEventHash
  )
    throw new Error("Retained audit export contents are inconsistent.");

  const evidence = await recordOperationalEvidence({
    type: "audit_export",
    source: "retained-audit-export-job",
    release,
    details: {
      manifestKey: keys.manifestKey,
      destinationIdentity: configuration.destinationIdentity,
      custodyReference: configuration.custodyReference,
      recordCount: verifiedPayload.recordCount,
      firstSequence: verifiedPayload.firstSequence,
      lastSequence: verifiedPayload.lastSequence,
      lastEventHash: verifiedPayload.lastEventHash,
      encryptedSha256: verifiedPayload.encryptedSha256,
      lifecycleDays: lifecycle.actualDays,
      requiredMigration: REQUIRED_MIGRATION,
    },
  });
  return {
    ok: true,
    snapshotId,
    manifestKey: keys.manifestKey,
    recordCount: verifiedPayload.recordCount,
    firstSequence: verifiedPayload.firstSequence,
    lastSequence: verifiedPayload.lastSequence,
    destinationIdentity: configuration.destinationIdentity,
    lifecycleDays: lifecycle.actualDays,
    evidence,
  };
}

try {
  console.log(JSON.stringify(await exportAndVerify(), null, 2));
} catch (error) {
  try {
    await recordOperationalEvidence({
      type: "audit_export",
      status: "failed",
      source: "retained-audit-export-job",
      release,
      details: {
        failureClass: String(error?.name || "Error").slice(0, 80),
        requiredMigration: REQUIRED_MIGRATION,
      },
    });
  } catch {
    // A failed export must still fail the scheduler when evidence cannot be stored.
  }
  throw error;
} finally {
  client?.destroy();
  await closeDatabase();
}
