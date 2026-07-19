import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { storageIdentity } from "./media-backup-policy.mjs";
import { objectStorageConfiguration } from "./storage.mjs";

export const AUDIT_EXPORT_VERSION = "1.0";
export const AUDIT_EXPORT_KIND = "content-protect-audit-export";
export const AUDIT_EXPORT_PREFIX = "content-protect-audit/daily/";

const ENVELOPE_MAGIC = Buffer.from("CPAEX001");

function remapStorage(env, prefix) {
  return {
    OBJECT_STORAGE_ENDPOINT: env[`${prefix}_ENDPOINT`],
    OBJECT_STORAGE_BUCKET: env[`${prefix}_BUCKET`],
    OBJECT_STORAGE_REGION: env[`${prefix}_REGION`],
    OBJECT_STORAGE_ACCESS_KEY_ID: env[`${prefix}_ACCESS_KEY_ID`],
    OBJECT_STORAGE_SECRET_ACCESS_KEY: env[`${prefix}_SECRET_ACCESS_KEY`],
  };
}

function requiredSecret(value, name) {
  if (typeof value !== "string" || value.length < 32)
    throw new Error(`${name} must contain at least 32 characters.`);
  return value;
}

function custodyReference(value) {
  const reference = String(value || "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,159}$/.test(reference))
    throw new Error(
      "AUDIT_EXPORT_CUSTODY_REFERENCE must be an opaque approved record reference.",
    );
  return reference;
}

function configuredStorage(env, prefix) {
  return objectStorageConfiguration(remapStorage(env, prefix));
}

function ensureDifferentCredentials(destination, candidate, label) {
  if (
    candidate.configured &&
    (destination.accessKeyId === candidate.accessKeyId ||
      destination.secretAccessKey === candidate.secretAccessKey)
  )
    throw new Error(
      `Audit export credentials must differ from ${label} credentials.`,
    );
}

export function auditExportConfiguration(env = process.env) {
  const destination = configuredStorage(env, "AUDIT_EXPORT_OBJECT_STORAGE"),
    primary = objectStorageConfiguration(env),
    backup = configuredStorage(env, "BACKUP_OBJECT_STORAGE"),
    encryptionKeyValue = requiredSecret(
      env.AUDIT_EXPORT_ENCRYPTION_KEY,
      "AUDIT_EXPORT_ENCRYPTION_KEY",
    ),
    evidenceKeyValue = requiredSecret(
      env.AUDIT_EXPORT_EVIDENCE_KEY,
      "AUDIT_EXPORT_EVIDENCE_KEY",
    );
  if (!destination.configured)
    throw new Error("Separate audit export object storage must be configured.");
  for (const [candidate, label] of [
    [primary, "primary media storage"],
    [backup, "backup storage"],
  ]) {
    if (
      candidate.configured &&
      storageIdentity(candidate) === storageIdentity(destination)
    )
      throw new Error(`Audit exports must not use the ${label} bucket.`);
    ensureDifferentCredentials(destination, candidate, label);
  }
  if (
    encryptionKeyValue === evidenceKeyValue ||
    [env.CONTENT_PROTECT_MASTER_KEY, env.BACKUP_EVIDENCE_KEY].includes(
      encryptionKeyValue,
    ) ||
    [env.CONTENT_PROTECT_MASTER_KEY, env.BACKUP_EVIDENCE_KEY].includes(
      evidenceKeyValue,
    )
  )
    throw new Error(
      "Audit export encryption and evidence keys must be separate from each other and application/backup keys.",
    );
  return {
    destination,
    destinationIdentity: storageIdentity(destination),
    custodyReference: custodyReference(env.AUDIT_EXPORT_CUSTODY_REFERENCE),
    encryptionKey: encryptionKeyValue,
    evidenceKey: evidenceKeyValue,
  };
}

function safeSnapshotId(value) {
  const snapshotId = String(value || "");
  if (!/^[A-Za-z0-9._-]{20,120}$/.test(snapshotId))
    throw new Error("Invalid audit export snapshot identifier.");
  return snapshotId;
}

export function auditExportKeys(snapshotId) {
  const prefix = `${AUDIT_EXPORT_PREFIX}${safeSnapshotId(snapshotId)}`;
  return {
    archiveKey: `${prefix}/audit.jsonl.gz.enc`,
    manifestKey: `${prefix}/manifest.json`,
  };
}

export function safeAuditManifestKey(value) {
  const key = String(value || "");
  if (
    key.length > 500 ||
    !/^content-protect-audit\/daily\/[A-Za-z0-9._-]{20,120}\/manifest\.json$/.test(
      key,
    )
  )
    throw new Error("Invalid audit export manifest key.");
  return key;
}

function assertHash(value, field, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (!/^[a-f0-9]{64}$/.test(String(value || "")))
    throw new Error(`Audit record ${field} is invalid.`);
}

export function serializeAuditRecords(records) {
  if (!Array.isArray(records)) throw new Error("Audit records are required.");
  let previousSequence = null,
    previousEventHash = null;
  const safe = records.map((record) => {
    if (
      !Number.isSafeInteger(record.sequenceNo) ||
      record.sequenceNo < 1 ||
      (previousSequence !== null &&
        record.sequenceNo !== previousSequence + 1) ||
      (previousEventHash !== null &&
        record.previousHash !== previousEventHash) ||
      !/^[0-9a-f-]{36}$/i.test(String(record.eventUuid || "")) ||
      !/^[a-z0-9._:-]{2,120}$/i.test(String(record.action || "")) ||
      !Number.isFinite(Date.parse(record.createdAt || "")) ||
      record.hashVersion !== 1 ||
      !record.details ||
      Array.isArray(record.details) ||
      typeof record.details !== "object" ||
      "userId" in record ||
      "actorSubject" in record
    )
      throw new Error(
        "Audit export contains an invalid or identifying record.",
      );
    assertHash(record.actorHash, "actorHash");
    assertHash(record.ipHash, "ipHash", { nullable: true });
    assertHash(record.previousHash, "previousHash", { nullable: true });
    assertHash(record.eventHash, "eventHash");
    previousSequence = record.sequenceNo;
    previousEventHash = record.eventHash;
    return {
      eventUuid: record.eventUuid,
      sequenceNo: record.sequenceNo,
      actorHash: record.actorHash,
      ipHash: record.ipHash,
      action: record.action,
      details: record.details,
      createdAt: new Date(record.createdAt).toISOString(),
      previousHash: record.previousHash,
      eventHash: record.eventHash,
      hashVersion: record.hashVersion,
    };
  });
  return Buffer.from(
    safe.length
      ? `${safe.map((item) => JSON.stringify(item)).join("\n")}\n`
      : "",
  );
}

export function parseAuditRecords(value) {
  const text = Buffer.from(value).toString("utf8"),
    lines = text ? text.trimEnd().split("\n") : [],
    records = lines.map((line) => JSON.parse(line));
  serializeAuditRecords(records);
  return records;
}

function encryptionKey(value) {
  return createHash("sha256")
    .update(requiredSecret(value, "AUDIT_EXPORT_ENCRYPTION_KEY"))
    .digest();
}

export function encryptAuditExport(value, secret) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv),
    ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  return Buffer.concat([ENVELOPE_MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptAuditExport(value, secret) {
  const envelope = Buffer.from(value);
  if (
    envelope.length < ENVELOPE_MAGIC.length + 12 + 16 ||
    !envelope.subarray(0, ENVELOPE_MAGIC.length).equals(ENVELOPE_MAGIC)
  )
    throw new Error("Audit export encryption envelope is invalid.");
  const ivStart = ENVELOPE_MAGIC.length,
    tagStart = ivStart + 12,
    bodyStart = tagStart + 16,
    decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(secret),
      envelope.subarray(ivStart, tagStart),
    );
  decipher.setAuthTag(envelope.subarray(tagStart, bodyStart));
  return Buffer.concat([
    decipher.update(envelope.subarray(bodyStart)),
    decipher.final(),
  ]);
}

function manifestSignature(payload, secret) {
  return createHmac(
    "sha256",
    requiredSecret(secret, "AUDIT_EXPORT_EVIDENCE_KEY"),
  )
    .update(JSON.stringify(payload))
    .digest("hex");
}

export function signAuditExportManifest(payload, secret) {
  validateAuditExportPayload(payload);
  return { payload, signature: manifestSignature(payload, secret) };
}

export function verifyAuditExportManifest(manifest, secret) {
  if (!manifest?.payload || !/^[a-f0-9]{64}$/.test(manifest.signature || ""))
    throw new Error("Audit export manifest is invalid.");
  validateAuditExportPayload(manifest.payload);
  const expected = Buffer.from(
      manifestSignature(manifest.payload, secret),
      "hex",
    ),
    received = Buffer.from(manifest.signature, "hex");
  if (!timingSafeEqual(expected, received))
    throw new Error("Audit export manifest signature verification failed.");
  return manifest.payload;
}

export function validateAuditExportPayload(payload) {
  const keys = auditExportKeys(payload?.snapshotId);
  if (
    payload?.version !== AUDIT_EXPORT_VERSION ||
    payload?.kind !== AUDIT_EXPORT_KIND ||
    !Number.isFinite(Date.parse(payload.createdAt || "")) ||
    !/^[a-f0-9]{16}$/.test(payload.destinationIdentity || "") ||
    custodyReference(payload.custodyReference) !== payload.custodyReference ||
    payload.archiveKey !== keys.archiveKey ||
    payload.manifestKey !== keys.manifestKey ||
    !Number.isSafeInteger(payload.recordCount) ||
    payload.recordCount < 0 ||
    !Number.isSafeInteger(payload.compressedSize) ||
    payload.compressedSize < 20 ||
    !Number.isSafeInteger(payload.encryptedSize) ||
    payload.encryptedSize !==
      payload.compressedSize + ENVELOPE_MAGIC.length + 12 + 16 ||
    !/^[a-f0-9]{64}$/.test(payload.jsonlSha256 || "") ||
    !/^[a-f0-9]{64}$/.test(payload.encryptedSha256 || "")
  )
    throw new Error("Audit export manifest payload is invalid.");
  if (payload.recordCount === 0) {
    if (
      payload.firstSequence !== null ||
      payload.lastSequence !== null ||
      payload.firstPreviousHash !== null ||
      payload.lastEventHash !== null
    )
      throw new Error("Empty audit export boundaries are invalid.");
  } else {
    if (
      !Number.isSafeInteger(payload.firstSequence) ||
      !Number.isSafeInteger(payload.lastSequence) ||
      payload.firstSequence < 1 ||
      payload.lastSequence < payload.firstSequence ||
      payload.lastSequence - payload.firstSequence + 1 !== payload.recordCount
    )
      throw new Error("Audit export sequence boundaries are invalid.");
    assertHash(payload.firstPreviousHash, "firstPreviousHash", {
      nullable: true,
    });
    assertHash(payload.lastEventHash, "lastEventHash");
  }
  return payload;
}

export function validateAuditExportLifecycle(
  rules,
  { retentionDays = 400 } = {},
) {
  const rule = (rules || []).find(
      (candidate) =>
        candidate.Status === "Enabled" &&
        (candidate.Filter?.Prefix ?? candidate.Prefix) === AUDIT_EXPORT_PREFIX,
    ),
    actual = Number.isInteger(rule?.Expiration?.Days)
      ? rule.Expiration.Days
      : null;
  return {
    ok: actual === retentionDays,
    expectedDays: retentionDays,
    actualDays: actual,
  };
}
