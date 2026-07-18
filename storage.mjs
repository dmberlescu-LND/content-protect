import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const configured = Boolean(
  process.env.OBJECT_STORAGE_ENDPOINT &&
  process.env.OBJECT_STORAGE_BUCKET &&
  process.env.OBJECT_STORAGE_ACCESS_KEY_ID &&
  process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
);
const client = configured
  ? new S3Client({
      region: process.env.OBJECT_STORAGE_REGION || "auto",
      endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
      credentials: {
        accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID,
        secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
      },
    })
  : null;
const bucket = process.env.OBJECT_STORAGE_BUCKET;

export function storageMode() {
  return configured ? "private-object-storage" : "encrypted-local-disk";
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
