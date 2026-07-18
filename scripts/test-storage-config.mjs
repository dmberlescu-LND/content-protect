import assert from "node:assert/strict";
import { objectStorageConfiguration } from "../storage.mjs";

assert.equal(objectStorageConfiguration({}).configured, false);
assert.throws(
  () => objectStorageConfiguration({ OBJECT_STORAGE_BUCKET: "private" }),
  /configuration is incomplete/,
);
assert.throws(
  () =>
    objectStorageConfiguration({
      OBJECT_STORAGE_ENDPOINT: "http://storage.example",
      OBJECT_STORAGE_BUCKET: "private",
      OBJECT_STORAGE_ACCESS_KEY_ID: "access",
      OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret",
    }),
  /must use HTTPS/,
);
const valid = objectStorageConfiguration({
  OBJECT_STORAGE_ENDPOINT: "https://account.r2.cloudflarestorage.com",
  OBJECT_STORAGE_BUCKET: "private",
  OBJECT_STORAGE_ACCESS_KEY_ID: "access",
  OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret",
});
assert.equal(valid.configured, true);
assert.equal(valid.region, "auto");
assert.equal(valid.bucket, "private");

console.log(
  JSON.stringify({
    ok: true,
    partialConfigurationRejected: true,
    insecureEndpointRejected: true,
    completeConfigurationAccepted: true,
  }),
);
