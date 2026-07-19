import { closeDatabase, runRetention } from "../database.mjs";

const execute = process.argv.includes("--execute");
if (execute && process.env.RETENTION_EXECUTION_ENABLED !== "true")
  throw new Error(
    "Set RETENTION_EXECUTION_ENABLED=true before executing retention deletions.",
  );

try {
  const result = await runRetention({ execute });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await closeDatabase();
}
