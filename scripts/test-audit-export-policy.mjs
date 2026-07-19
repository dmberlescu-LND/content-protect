import assert from "node:assert/strict";
import { createHash } from "node:crypto";

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

const env = {
    OBJECT_STORAGE_ENDPOINT: "https://primary.example",
    OBJECT_STORAGE_BUCKET: "primary",
    OBJECT_STORAGE_REGION: "auto",
    OBJECT_STORAGE_ACCESS_KEY_ID: "primary-access",
    OBJECT_STORAGE_SECRET_ACCESS_KEY: "primary-secret",
    BACKUP_OBJECT_STORAGE_ENDPOINT: "https://backup.example",
    BACKUP_OBJECT_STORAGE_BUCKET: "backup",
    BACKUP_OBJECT_STORAGE_REGION: "auto",
    BACKUP_OBJECT_STORAGE_ACCESS_KEY_ID: "backup-access",
    BACKUP_OBJECT_STORAGE_SECRET_ACCESS_KEY: "backup-secret",
    AUDIT_EXPORT_OBJECT_STORAGE_ENDPOINT: "https://retained.example",
    AUDIT_EXPORT_OBJECT_STORAGE_BUCKET: "audit-retained",
    AUDIT_EXPORT_OBJECT_STORAGE_REGION: "auto",
    AUDIT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID: "audit-write-read",
    AUDIT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY: "audit-secret",
    AUDIT_EXPORT_CUSTODY_REFERENCE: "security/audit-custody-2026-07-v1",
    AUDIT_EXPORT_ENCRYPTION_KEY: "e".repeat(40),
    AUDIT_EXPORT_EVIDENCE_KEY: "s".repeat(40),
  },
  configuration = auditExportConfiguration(env),
  firstHash = "1".repeat(64),
  records = [
    {
      databaseId: 91,
      eventUuid: "11111111-1111-4111-8111-111111111111",
      sequenceNo: 9,
      actorHash: "a".repeat(64),
      ipHash: "b".repeat(64),
      action: "case.created",
      details: { caseId: "opaque-case" },
      createdAt: "2026-07-19T21:00:00.000Z",
      previousHash: "0".repeat(64),
      eventHash: firstHash,
      hashVersion: 1,
    },
    {
      databaseId: 92,
      eventUuid: "22222222-2222-4222-8222-222222222222",
      sequenceNo: 10,
      actorHash: "c".repeat(64),
      ipHash: null,
      action: "case.prepared",
      details: { caseId: "opaque-case" },
      createdAt: "2026-07-19T21:01:00.000Z",
      previousHash: firstHash,
      eventHash: "2".repeat(64),
      hashVersion: 1,
    },
  ],
  jsonl = serializeAuditRecords(records),
  parsed = parseAuditRecords(jsonl),
  encrypted = encryptAuditExport(jsonl, env.AUDIT_EXPORT_ENCRYPTION_KEY),
  snapshotId = "2026-07-19T21-00-00-000Z-11111111-1111-4111-8111-111111111111",
  keys = auditExportKeys(snapshotId),
  payload = {
    version: AUDIT_EXPORT_VERSION,
    kind: AUDIT_EXPORT_KIND,
    createdAt: "2026-07-19T21:02:00.000Z",
    snapshotId,
    destinationIdentity: configuration.destinationIdentity,
    custodyReference: configuration.custodyReference,
    recordCount: 2,
    firstSequence: 9,
    lastSequence: 10,
    firstPreviousHash: "0".repeat(64),
    lastEventHash: "2".repeat(64),
    jsonlSha256: createHash("sha256").update(jsonl).digest("hex"),
    compressedSize: 50,
    encryptedSize: 86,
    encryptedSha256: "3".repeat(64),
    archiveKey: keys.archiveKey,
    manifestKey: keys.manifestKey,
  },
  manifest = signAuditExportManifest(payload, env.AUDIT_EXPORT_EVIDENCE_KEY);

assert.equal(configuration.destination.bucket, "audit-retained");
assert.equal(parsed.length, 2);
assert.equal(parsed[0].databaseId, undefined);
assert.equal(parsed[0].userId, undefined);
assert.deepEqual(
  decryptAuditExport(encrypted, env.AUDIT_EXPORT_ENCRYPTION_KEY),
  jsonl,
);
assert.deepEqual(
  verifyAuditExportManifest(manifest, env.AUDIT_EXPORT_EVIDENCE_KEY),
  payload,
);
assert.throws(
  () =>
    auditExportConfiguration({
      ...env,
      AUDIT_EXPORT_OBJECT_STORAGE_ENDPOINT: env.OBJECT_STORAGE_ENDPOINT,
      AUDIT_EXPORT_OBJECT_STORAGE_BUCKET: env.OBJECT_STORAGE_BUCKET,
    }),
  /must not use/i,
);
assert.throws(
  () =>
    auditExportConfiguration({
      ...env,
      AUDIT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID:
        env.BACKUP_OBJECT_STORAGE_ACCESS_KEY_ID,
    }),
  /credentials must differ/i,
);
assert.throws(
  () =>
    auditExportConfiguration({
      ...env,
      AUDIT_EXPORT_EVIDENCE_KEY: env.AUDIT_EXPORT_ENCRYPTION_KEY,
    }),
  /keys must be separate/i,
);
assert.throws(
  () =>
    serializeAuditRecords([
      records[0],
      { ...records[1], previousHash: "f".repeat(64) },
    ]),
  /invalid or identifying/i,
);
assert.throws(
  () => serializeAuditRecords([{ ...records[0], userId: "should-not-export" }]),
  /identifying/i,
);
const alteredCiphertext = Buffer.from(encrypted);
alteredCiphertext[alteredCiphertext.length - 1] ^= 1;
assert.throws(
  () => decryptAuditExport(alteredCiphertext, env.AUDIT_EXPORT_ENCRYPTION_KEY),
  /authenticate|unsupported state/i,
);
assert.throws(
  () =>
    verifyAuditExportManifest(
      { ...manifest, signature: "4".repeat(64) },
      env.AUDIT_EXPORT_EVIDENCE_KEY,
    ),
  /signature/i,
);
assert.deepEqual(
  validateAuditExportLifecycle([
    {
      Status: "Enabled",
      Filter: { Prefix: "content-protect-audit/daily/" },
      Expiration: { Days: 400 },
    },
  ]),
  { ok: true, expectedDays: 400, actualDays: 400 },
);
assert.equal(validateAuditExportLifecycle([]).ok, false);

console.log(
  JSON.stringify({
    ok: true,
    separateDestinationRequired: true,
    separateCredentialsRequired: true,
    separateCryptographicKeysRequired: true,
    pseudonymousProjection: true,
    contiguousChainRequired: true,
    encryptedArchiveAuthenticated: true,
    signedManifestRequired: true,
    overwriteSafeKeys: true,
    retentionLifecycleRequired: true,
  }),
);
