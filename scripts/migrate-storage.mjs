import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { closeDatabase, loadPostgresState } from "../database.mjs";
import {
  getEncryptedObject,
  putEncryptedObject,
  storageMode,
  storageProbe,
} from "../storage.mjs";

const dataRoot = process.env.CONTENT_PROTECT_DATA_DIR
    ? path.resolve(process.env.CONTENT_PROTECT_DATA_DIR)
    : path.join(process.cwd(), ".traceguard-data"),
  localVault = path.join(dataRoot, "vault"),
  digest = (value) => createHash("sha256").update(value).digest("hex");

function sourcePath(objectKey) {
  const resolved = path.resolve(localVault, objectKey),
    prefix = `${path.resolve(localVault)}${path.sep}`;
  assert.ok(resolved.startsWith(prefix), "Asset object key escapes the local vault.");
  return resolved;
}

try {
  assert.equal(
    storageMode(),
    "private-object-storage",
    "Private object storage must be fully configured before migration.",
  );
  assert.ok(
    process.env.CONTENT_PROTECT_MASTER_KEY,
    "CONTENT_PROTECT_MASTER_KEY must be available during migration.",
  );
  const state = await loadPostgresState();
  assert.ok(state, "DATABASE_URL must point to the production PostgreSQL database.");
  await storageProbe(localVault);

  const report = {
    ok: false,
    assetsDiscovered: state.assets.length,
    assetsCopied: 0,
    encryptedChecksumsVerified: 0,
    localOriginalsPreserved: true,
    failures: [],
  };

  for (const asset of state.assets) {
    const objectKey = asset.objectKey || `${asset.id}.vault`;
    try {
      const localEncrypted = await readFile(sourcePath(objectKey));
      await putEncryptedObject(objectKey, localEncrypted, localVault);
      const remoteEncrypted = await getEncryptedObject(objectKey, localVault);
      assert.equal(
        digest(remoteEncrypted),
        digest(localEncrypted),
        "Encrypted object checksum mismatch after upload.",
      );
      report.assetsCopied += 1;
      report.encryptedChecksumsVerified += 1;
    } catch (error) {
      report.failures.push({
        assetId: asset.id,
        objectKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  report.ok = report.failures.length === 0;
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  await closeDatabase();
}
