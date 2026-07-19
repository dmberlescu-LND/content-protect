import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { backupTiersForDate } from "../backup-schedule.mjs";

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "")
      .trim()
      .toLowerCase(),
  );
}

function run(script, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(script)], {
      env: { ...process.env, ...environment },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) return resolve();
      reject(
        new Error(
          `${fileURLToPath(script)} failed${
            signal ? ` with signal ${signal}` : ` with status ${code}`
          }.`,
        ),
      );
    });
  });
}

const startedAt = new Date(),
  tiers = backupTiersForDate(startedAt, {
    forceMonthly: enabled(process.env.BACKUP_FORCE_MONTHLY),
  }),
  databaseBackup = new URL("./create-database-backup.mjs", import.meta.url),
  mediaBackup = new URL("./create-media-backup.mjs", import.meta.url);

for (const tier of tiers) {
  await run(databaseBackup, { DATABASE_BACKUP_TIER: tier });
  await run(mediaBackup, { MEDIA_BACKUP_TIER: tier });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      tiers,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
