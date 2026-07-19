import { spawn } from "node:child_process";
import { randomInt } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { safeDatabaseManifestKey } from "../database-backup-policy.mjs";
import { isolatedRestoreConfiguration } from "../isolated-restore-policy.mjs";

const manifestKey = safeDatabaseManifestKey(process.argv[2]),
  temporaryDirectory = await mkdtemp(
    join(tmpdir(), "content-protect-isolated-restore-"),
  ),
  dataDirectory = join(temporaryDirectory, "postgres"),
  socketDirectory = join(temporaryDirectory, "socket"),
  restore = isolatedRestoreConfiguration({ port: randomInt(20000, 45000) }),
  restoreScript = fileURLToPath(
    new URL("./restore-database-backup.mjs", import.meta.url),
  );
let postgresStarted = false;

function run(command, args, { env = process.env, inherit = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
        env,
        stdio: inherit ? "inherit" : ["ignore", "ignore", "pipe"],
      }),
      errors = [];
    if (!inherit)
      child.stderr.on("data", (chunk) => {
        if (errors.reduce((total, item) => total + item.length, 0) < 20_000)
          errors.push(Buffer.from(chunk));
      });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) return resolve();
      reject(
        new Error(
          `${command} failed${signal ? ` with signal ${signal}` : ` with status ${code}`}${
            errors.length
              ? `: ${Buffer.concat(errors).toString("utf8").trim().slice(0, 20_000)}`
              : ""
          }.`,
        ),
      );
    });
  });
}

try {
  await mkdir(socketDirectory, { mode: 0o700 });
  await run("initdb", [
    `--pgdata=${dataDirectory}`,
    "--auth-local=trust",
    "--auth-host=trust",
    `--username=${restore.user}`,
    "--no-locale",
    "--encoding=UTF8",
  ]);
  await run("pg_ctl", [
    `--pgdata=${dataDirectory}`,
    "--wait",
    "--options",
    `-h ${restore.host} -p ${restore.port} -k ${socketDirectory}`,
    "start",
  ]);
  postgresStarted = true;
  await run("createdb", [
    `--host=${restore.host}`,
    `--port=${restore.port}`,
    `--username=${restore.user}`,
    restore.database,
  ]);

  const restoreEnvironment = { ...process.env };
  delete restoreEnvironment.DATABASE_URL;
  restoreEnvironment.RESTORE_DATABASE_URL = restore.connectionString;
  await run(process.execPath, [restoreScript, manifestKey], {
    env: restoreEnvironment,
    inherit: true,
  });
} finally {
  if (postgresStarted)
    await run("pg_ctl", [
      `--pgdata=${dataDirectory}`,
      "--wait",
      "--mode=fast",
      "stop",
    ]).catch(() => {});
  await rm(temporaryDirectory, { recursive: true, force: true });
}
