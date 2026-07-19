import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { spawn } from "node:child_process";
import {
  createCipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  BACKUP_MANIFEST_VERSION,
  signBackupManifest,
} from "../backup-restore-policy.mjs";
import {
  collectBackupSnapshot,
  databaseClient,
  databaseIdentity,
} from "../backup-snapshot.mjs";
import {
  DATABASE_BACKUP_CIPHER,
  DATABASE_BACKUP_KIND,
  databaseBackupConfiguration,
  databaseBackupObjectKeys,
  postgresCommandEnvironment,
} from "../database-backup-policy.mjs";
import { storageIdentity } from "../media-backup-policy.mjs";

const connectionString = process.env.DATABASE_URL,
  evidenceKey = process.env.BACKUP_EVIDENCE_KEY,
  tier = process.env.DATABASE_BACKUP_TIER || "daily";
if (!connectionString) throw new Error("DATABASE_URL is required.");

const snapshotId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`,
  { archiveKey, manifestKey } = databaseBackupObjectKeys({ tier, snapshotId }),
  { backup, encryptionKey } = databaseBackupConfiguration(process.env, {
    requirePrimarySeparation: true,
  }),
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
    join(tmpdir(), "content-protect-database-backup-"),
  ),
  dumpPath = join(temporaryDirectory, "database.dump"),
  encryptedPath = join(temporaryDirectory, "database.dump.enc"),
  database = databaseClient(connectionString);

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
  // Keep the exporter transaction open so pg_dump and the integrity manifest
  // observe the exact same PostgreSQL snapshot.
  await database.connect();
  await database.query(
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
  );
  let snapshot;
  try {
    const exported = await database.query("SELECT pg_export_snapshot() AS id"),
      exportedSnapshot = exported.rows[0]?.id;
    if (!/^[0-9A-F-]{5,120}$/i.test(exportedSnapshot || ""))
      throw new Error("PostgreSQL did not return a valid exported snapshot.");
    await run(
      "pg_dump",
      [
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        `--snapshot=${exportedSnapshot}`,
        `--file=${dumpPath}`,
      ],
      { env: postgresCommandEnvironment(connectionString) },
    );
    snapshot = await collectBackupSnapshot(database, evidenceKey, {
      manageTransaction: false,
    });
    await database.query("COMMIT");
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  }

  const iv = randomBytes(12),
    cipher = createCipheriv(DATABASE_BACKUP_CIPHER, encryptionKey, iv);
  await pipeline(
    createReadStream(dumpPath),
    cipher,
    createWriteStream(encryptedPath, { mode: 0o600 }),
  );
  const authTag = cipher.getAuthTag(),
    encryptedSize = (await stat(encryptedPath)).size,
    encryptedSha256 = await new Promise((resolve, reject) => {
      const digest = createHash("sha256"),
        input = createReadStream(encryptedPath);
      input.on("data", (chunk) => digest.update(chunk));
      input.once("error", reject);
      input.once("end", () => resolve(digest.digest("hex")));
    });

  await backupClient.send(
    new PutObjectCommand({
      Bucket: backup.bucket,
      Key: archiveKey,
      Body: createReadStream(encryptedPath),
      ContentLength: encryptedSize,
      ContentType: "application/octet-stream",
      Metadata: {
        encrypted: DATABASE_BACKUP_CIPHER,
        sha256: encryptedSha256,
        snapshot: snapshotId,
      },
    }),
  );

  const payload = {
      version: BACKUP_MANIFEST_VERSION,
      kind: DATABASE_BACKUP_KIND,
      createdAt: new Date().toISOString(),
      snapshotId,
      tier,
      sourceIdentity: databaseIdentity(connectionString),
      release: process.env.RENDER_GIT_COMMIT?.slice(0, 40) || null,
      backupStorageIdentity: backupIdentity,
      archiveObjectKey: archiveKey,
      encryptedSize,
      encryptedSha256,
      encryption: {
        algorithm: DATABASE_BACKUP_CIPHER,
        iv: iv.toString("hex"),
        authTag: authTag.toString("hex"),
      },
      ...snapshot,
    },
    manifest = signBackupManifest(payload, evidenceKey);
  await backupClient.send(
    new PutObjectCommand({
      Bucket: backup.bucket,
      Key: manifestKey,
      Body: JSON.stringify(manifest),
      ContentType: "application/json",
      Metadata: { complete: "true", snapshot: snapshotId, tier },
    }),
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        snapshotId,
        tier,
        archiveKey,
        manifestKey,
        encryptedSize,
        completedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
} finally {
  await database.end().catch(() => {});
  backupClient.destroy();
  await rm(temporaryDirectory, { recursive: true, force: true });
}
