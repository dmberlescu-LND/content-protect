import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const REQUIRED_STORAGE_ENV = [
  "OBJECT_STORAGE_ENDPOINT",
  "OBJECT_STORAGE_BUCKET",
  "OBJECT_STORAGE_ACCESS_KEY_ID",
  "OBJECT_STORAGE_SECRET_ACCESS_KEY",
];

export function objectStorageConfiguration(env = process.env) {
  const supplied = REQUIRED_STORAGE_ENV.filter((name) => Boolean(env[name])),
    missing = REQUIRED_STORAGE_ENV.filter((name) => !env[name]);
  if (supplied.length && missing.length)
    throw new Error(
      `Private object storage configuration is incomplete. Missing: ${missing.join(", ")}.`,
    );
  if (!supplied.length) return { configured: false, missing: REQUIRED_STORAGE_ENV };
  let endpoint;
  try {
    endpoint = new URL(env.OBJECT_STORAGE_ENDPOINT);
  } catch {
    throw new Error("OBJECT_STORAGE_ENDPOINT must be a valid HTTPS URL.");
  }
  if (endpoint.protocol !== "https:")
    throw new Error("OBJECT_STORAGE_ENDPOINT must use HTTPS.");
  return {
    configured: true,
    endpoint: endpoint.toString(),
    bucket: env.OBJECT_STORAGE_BUCKET,
    region: env.OBJECT_STORAGE_REGION || "auto",
    accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
  };
}

const configuration = objectStorageConfiguration();
const client = configuration.configured
  ? new S3Client({
      region: configuration.region,
      endpoint: configuration.endpoint,
      credentials: {
        accessKeyId: configuration.accessKeyId,
        secretAccessKey: configuration.secretAccessKey,
      },
    })
  : null;
const bucket = configuration.bucket;

export function externalMasterKeyRequired() {
  return configuration.configured;
}

export function storageMode() {
  return configuration.configured
    ? "private-object-storage"
    : "encrypted-local-disk";
}

export async function storageProbe(localRoot) {
  const startedAt = Date.now();
  if (client) await client.send(new HeadBucketCommand({ Bucket: bucket }));
  else {
    await mkdir(localRoot, { recursive: true });
    await access(localRoot);
  }
  return {
    ok: true,
    mode: storageMode(),
    latencyMs: Date.now() - startedAt,
  };
}

export async function putEncryptedObject(objectKey, encrypted, localRoot) {
  if (client) {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: encrypted,
        ContentType: "application/octet-stream",
        Metadata: { encrypted: "aes-256-gcm", version: "1" },
      }),
    );
    return;
  }
  const localPath = path.join(localRoot, objectKey);
  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, encrypted, { mode: 0o600 });
}

export async function getEncryptedObject(objectKey, localRoot) {
  if (client) {
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
    );
    return Buffer.from(await response.Body.transformToByteArray());
  }
  return readFile(path.join(localRoot, objectKey));
}

export async function deleteEncryptedObject(objectKey, localRoot) {
  if (client) {
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }),
    );
    return;
  }
  try {
    await unlink(path.join(localRoot, objectKey));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
