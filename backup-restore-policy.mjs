import { createHmac, timingSafeEqual } from "node:crypto";

export const BACKUP_MANIFEST_VERSION = "1.0";

function manifestKey(value) {
  if (typeof value !== "string" || value.length < 32)
    throw new Error("BACKUP_EVIDENCE_KEY must contain at least 32 characters.");
  return value;
}

function signatureFor(payload, key) {
  return createHmac("sha256", manifestKey(key))
    .update(JSON.stringify(payload))
    .digest("hex");
}

export function signBackupManifest(payload, key) {
  if (payload?.version !== BACKUP_MANIFEST_VERSION)
    throw new Error("Unsupported backup manifest version.");
  return { payload, signature: signatureFor(payload, key) };
}

export function verifyBackupManifest(manifest, key) {
  if (
    !manifest?.payload ||
    manifest.payload.version !== BACKUP_MANIFEST_VERSION ||
    !/^[a-f0-9]{64}$/.test(manifest.signature || "")
  )
    throw new Error("Backup manifest is invalid or unsupported.");
  const expected = Buffer.from(signatureFor(manifest.payload, key), "hex"),
    received = Buffer.from(manifest.signature, "hex");
  if (!timingSafeEqual(expected, received))
    throw new Error("Backup manifest signature verification failed.");
  return manifest.payload;
}

export function compareBackupSnapshots(expected, restored) {
  const discrepancies = [];
  if (expected.requiredMigration !== restored.requiredMigration)
    discrepancies.push({
      field: "requiredMigration",
      expected: expected.requiredMigration,
      actual: restored.requiredMigration,
    });
  for (const [table, expectedTable] of Object.entries(expected.tables || {})) {
    const restoredTable = restored.tables?.[table];
    if (!restoredTable) {
      discrepancies.push({ field: `tables.${table}`, error: "missing" });
      continue;
    }
    for (const field of ["count", "sampleSize", "sampleHmac"])
      if (expectedTable[field] !== restoredTable[field])
        discrepancies.push({
          field: `tables.${table}.${field}`,
          expected: expectedTable[field],
          actual: restoredTable[field],
        });
  }
  return { ok: discrepancies.length === 0, discrepancies };
}
