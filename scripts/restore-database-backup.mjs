import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { spawn } from "node:child_process";
import { createDecipheriv, createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { verifyBackupManifest } from "../backup-restore-policy.mjs";
import {
  collectBackupSnapshot,
  databaseClient,
  databaseIdentity,
} from "../backup-snapshot.mjs";
import {
  databaseBackupConfiguration,
  postgresCommandEnvironment,
  safeDatabaseManifestKey,
  validateDatabaseBackupManifest,
} from "../database-backup-policy.mjs";
import { storageIdentity } from "../media-backup-policy.mjs";

const manifestKey = safeDatabaseManifestKey(process.argv[2]),
  connectionString = process.env.RESTORE_DATABASE_URL,
  evidenceKey = process.env.BACKUP_EVIDENCE_KEY,
  startedAt = new Date().toISOString();
if (!connectionString)
  throw new Error(
    "RESTORE_DATABASE_URL is required; DATABASE_URL is never used.",
  );

const { backup, encryptionKey } = databaseBackupConfiguration(),
  backupIdentity = storageIdentity(backup),
  backupClient = new S3Client({
    region: backup.region,
    endpoint: backup.endpoint,
    credentials: {
      accessKeyId: backup.accessKeyId,
      secretAccessKey: backup.secretAccessKey,
    },
  }),
  temporaryDirectory = await mkdtemp(
    join(tmpdir(), "content-protect-database-restore-"),
  ),
  encryptedPath = join(temporaryDirectory, "database.dump.enc"),
  dumpPath = join(temporaryDirectory, "database.dump"),
  restoreDatabase = databaseClient(connectionString);

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
        ...options,
        stdio: ["ignore", "ignore", "pipe"],
      }),
      errors = [];
    child.stderr.on("data", (chunk) => {
      if (errors.reduce((total, item) => total + item.length, 0) < 20_000)
        errors.push(Buffer.from(chunk));
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) return resolve();
      reject(
        new Error(
          `${command} exited with status ${code}: ${Buffer.concat(errors)
            .toString("utf8")
            .trim()
            .slice(0, 20_000)}`,
        ),
      );
    });
  });
}

try {
  const manifestResponse = await backupClient.send(
      new GetObjectCommand({ Bucket: backup.bucket, Key: manifestKey }),
    ),
    manifestBytes = Buffer.from(
      await manifestResponse.Body.transformToByteArray(),
    );
  if (manifestBytes.length > 10_000_000)
    throw new Error("The database backup manifest exceeds the safety limit.");
  const payload = validateDatabaseBackupManifest(
    verifyBackupManifest(
      JSON.parse(manifestBytes.toString("utf8")),
      evidenceKey,
    ),
    backupIdentity,
  );
  if (databaseIdentity(connectionString) === payload.sourceIdentity)
    throw new Error("Restore refuses to run against the source database.");

  await restoreDatabase.connect();
  const existing = await restoreDatabase.query(
    "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'",
  );
  if (existing.rows[0].count !== 0)
    throw new Error("The restore database must be isolated and empty.");

  const archiveResponse = await backupClient.send(
    new GetObjectCommand({
      Bucket: backup.bucket,
      Key: payload.archiveObjectKey,
    }),
  );
  await pipeline(
    archiveResponse.Body,
    createWriteStream(encryptedPath, { mode: 0o600 }),
  );
  const encryptedSize = (await stat(encryptedPath)).size,
    encryptedSha256 = await new Promise((resolve, reject) => {
      const digest = createHash("sha256"),
        input = createReadStream(encryptedPath);
      input.on("data", (chunk) => digest.update(chunk));
      input.once("error", reject);
      input.once("end", () => resolve(digest.digest("hex")));
    });
  if (
    encryptedSize !== payload.encryptedSize ||
    encryptedSha256 !== payload.encryptedSha256
  )
    throw new Error("The encrypted database archive failed integrity checks.");

  const decipher = createDecipheriv(
    payload.encryption.algorithm,
    encryptionKey,
    Buffer.from(payload.encryption.iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(payload.encryption.authTag, "hex"));
  await pipeline(
    createReadStream(encryptedPath),
    decipher,
    createWriteStream(dumpPath, { mode: 0o600 }),
  );
  const postgresEnvironment = postgresCommandEnvironment(connectionString);
  await run(
    "pg_restore",
    [
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      `--dbname=${postgresEnvironment.PGDATABASE}`,
      dumpPath,
    ],
    { env: postgresEnvironment },
  );

  const restored = await collectBackupSnapshot(restoreDatabase, evidenceKey),
    discrepancies = [];
  if (payload.requiredMigration !== restored.requiredMigration)
    discrepancies.push({ field: "requiredMigration" });
  for (const [table, expected] of Object.entries(payload.tables)) {
    const actual = restored.tables?.[table];
    for (const field of ["count", "sampleSize", "sampleHmac"])
      if (expected[field] !== actual?.[field])
        discrepancies.push({ field: `tables.${table}.${field}` });
  }
  const evidence = {
    ok: discrepancies.length === 0,
    snapshotId: payload.snapshotId,
    manifestKey,
    manifestCreatedAt: payload.createdAt,
    sourceIdentity: payload.sourceIdentity,
    restoreIdentity: databaseIdentity(connectionString),
    requiredMigration: restored.requiredMigration,
    tablesChecked: Object.keys(payload.tables),
    discrepancies,
    startedAt,
    completedAt: new Date().toISOString(),
  };
  const evidenceUrl = String(process.env.BACKUP_RESTORE_EVIDENCE_URL || ""),
    evidenceToken = String(process.env.BACKUP_RESTORE_EVIDENCE_TOKEN || "");
  if (Boolean(evidenceUrl) !== Boolean(evidenceToken))
    throw new Error(
      "BACKUP_RESTORE_EVIDENCE_URL and BACKUP_RESTORE_EVIDENCE_TOKEN must be configured together.",
    );
  if (evidence.ok && evidenceUrl) {
    const destination = new URL(evidenceUrl);
    if (
      destination.protocol !== "https:" ||
      destination.pathname !== "/api/operations/backup-restore-evidence"
    )
      throw new Error("BACKUP_RESTORE_EVIDENCE_URL is invalid.");
    const response = await fetch(destination, {
      method: "POST",
      headers: {
        authorization: `Bearer ${evidenceToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        snapshotId: evidence.snapshotId,
        manifestKey: evidence.manifestKey,
        sourceIdentity: evidence.sourceIdentity,
        restoreIdentity: evidence.restoreIdentity,
        tablesChecked: evidence.tablesChecked,
        release: payload.release,
      }),
    });
    if (!response.ok)
      throw new Error(
        `Restore evidence endpoint rejected the result (${response.status}).`,
      );
    evidence.reported = true;
  } else evidence.reported = false;
  console.log(JSON.stringify(evidence, null, 2));
  if (!evidence.ok) process.exitCode = 1;
} finally {
  await restoreDatabase.end().catch(() => {});
  backupClient.destroy();
  await rm(temporaryDirectory, { recursive: true, force: true });
}
