import { closeDatabase, runRetention } from "../database.mjs";
import { deleteEncryptedObject } from "../storage.mjs";
import path from "node:path";

const execute = process.argv.includes("--execute");
if (execute && process.env.RETENTION_EXECUTION_ENABLED !== "true")
  throw new Error(
    "Set RETENTION_EXECUTION_ENABLED=true before executing retention deletions.",
  );

try {
  const dataRoot = process.env.CONTENT_PROTECT_DATA_DIR
      ? path.resolve(process.env.CONTENT_PROTECT_DATA_DIR)
      : path.join(process.cwd(), ".traceguard-data"),
    vaultRoot = path.join(dataRoot, "vault"),
    result = await runRetention({
      execute,
      deleteObject: execute
        ? (objectKey) => deleteEncryptedObject(objectKey, vaultRoot)
        : undefined,
    });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await closeDatabase();
}
