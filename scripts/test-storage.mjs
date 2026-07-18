import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  deleteEncryptedObject,
  getEncryptedObject,
  putEncryptedObject,
  storageMode,
  storageProbe,
} from "../storage.mjs";

assert.equal(
  storageMode(),
  "private-object-storage",
  "Configure the private object-storage environment before running this test.",
);

const objectKey = `_content-protect-health/${randomUUID()}.vault`,
  payload = randomBytes(1024),
  checksum = createHash("sha256").update(payload).digest("hex");

try {
  const probe = await storageProbe("unused");
  assert.equal(probe.ok, true);
  await putEncryptedObject(objectKey, payload, "unused");
  const restored = await getEncryptedObject(objectKey, "unused");
  assert.equal(createHash("sha256").update(restored).digest("hex"), checksum);
  console.log(
    JSON.stringify({
      ok: true,
      mode: storageMode(),
      bucketReachable: true,
      writeReadChecksumVerified: true,
      disposableObjectDeleted: true,
    }),
  );
} finally {
  await deleteEncryptedObject(objectKey, "unused");
}
