import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  backupRestoreDrillDue,
  backupTiersForDate,
} from "../backup-schedule.mjs";

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "")
      .trim()
      .toLowerCase(),
  );
}

function run(script, environment, { args = [], captureJson = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(script), ...args], {
        env: { ...process.env, ...environment },
        stdio: captureJson ? ["ignore", "pipe", "inherit"] : "inherit",
      }),
      output = [];
    if (captureJson)
      child.stdout.on("data", (chunk) => {
        process.stdout.write(chunk);
        if (output.reduce((total, item) => total + item.length, 0) < 100_000)
          output.push(Buffer.from(chunk));
      });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        if (!captureJson) return resolve();
        try {
          return resolve(JSON.parse(Buffer.concat(output).toString("utf8")));
        } catch {
          return reject(new Error("Backup job returned invalid result JSON."));
        }
      }
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

async function recentRestoreEvidence() {
  const base = String(
    process.env.APP_URL || "https://content-protect.com",
  ).replace(/\/$/, "");
  try {
    const response = await fetch(`${base}/api/health`, {
        signal: AbortSignal.timeout(15_000),
      }),
      body = await response.json();
    return body?.operationalGates?.backupRestore === true;
  } catch {
    return false;
  }
}

const startedAt = new Date(),
  tiers = backupTiersForDate(startedAt, {
    forceMonthly: enabled(process.env.BACKUP_FORCE_MONTHLY),
  }),
  databaseBackup = new URL("./create-database-backup.mjs", import.meta.url),
  mediaBackup = new URL("./create-media-backup.mjs", import.meta.url),
  restoreDrill = new URL("./run-isolated-restore-drill.mjs", import.meta.url);
let latestDatabaseBackup;

for (const tier of tiers) {
  latestDatabaseBackup = await run(
    databaseBackup,
    { DATABASE_BACKUP_TIER: tier },
    { captureJson: true },
  );
  await run(mediaBackup, { MEDIA_BACKUP_TIER: tier });
}

const restoreRequired = backupRestoreDrillDue(startedAt, {
  verifiedRecently: await recentRestoreEvidence(),
  force: enabled(process.env.BACKUP_FORCE_RESTORE_DRILL),
});
if (restoreRequired)
  await run(restoreDrill, {}, { args: [latestDatabaseBackup.manifestKey] });

console.log(
  JSON.stringify(
    {
      ok: true,
      tiers,
      restoreDrill: restoreRequired ? "completed" : "not-due",
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
