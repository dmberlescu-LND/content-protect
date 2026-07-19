import { createHash } from "node:crypto";
import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildLaunchGovernancePayload,
  signLaunchGovernancePayload,
} from "../launch-governance.mjs";
import { REQUIRED_MIGRATION } from "../operations-readiness.mjs";

const root = await realpath(
  resolve(dirname(fileURLToPath(import.meta.url)), ".."),
);

function outsideRepository(value, label) {
  if (!value || !isAbsolute(value))
    throw new Error(
      `${label} must be an absolute path outside the repository.`,
    );
  const path = resolve(value),
    relativePath = relative(root, path);
  if (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  )
    throw new Error(`${label} must remain outside the repository.`);
  return path;
}

const [inputValue, privateKeyValue, outputValue] = process.argv.slice(2);
if (!inputValue || !privateKeyValue || !outputValue)
  throw new Error(
    "Usage: pnpm governance:sign /absolute/input.json /absolute/private-key.pem /absolute/manifest.json",
  );

const inputCandidate = outsideRepository(inputValue, "Governance input"),
  privateKeyCandidate = outsideRepository(privateKeyValue, "Private key"),
  outputCandidate = outsideRepository(outputValue, "Manifest output"),
  [inputPath, privateKeyPath, outputDirectory] = await Promise.all([
    realpath(inputCandidate),
    realpath(privateKeyCandidate),
    realpath(dirname(outputCandidate)),
  ]),
  outputPath = resolve(outputDirectory, basename(outputCandidate));
outsideRepository(inputPath, "Governance input");
outsideRepository(privateKeyPath, "Private key");
outsideRepository(outputPath, "Manifest output");

const privateKeyStat = await stat(privateKeyPath);
if (!privateKeyStat.isFile() || (privateKeyStat.mode & 0o077) !== 0)
  throw new Error(
    "The governance private key must be a regular file readable only by its owner (mode 0600).",
  );

const [inputText, privateKey] = await Promise.all([
  readFile(inputPath, "utf8"),
  readFile(privateKeyPath, "utf8"),
]);
let input;
try {
  input = JSON.parse(inputText);
} catch {
  throw new Error("Governance input must contain valid JSON.");
}

const payload = buildLaunchGovernancePayload(input, {
    expectedMigration: REQUIRED_MIGRATION,
  }),
  manifest = signLaunchGovernancePayload(payload, privateKey),
  serialized = `${JSON.stringify(manifest)}\n`;

await writeFile(outputPath, serialized, {
  encoding: "utf8",
  flag: "wx",
  mode: 0o600,
});
console.log(
  JSON.stringify({
    ok: true,
    output: outputPath,
    manifestSha256: createHash("sha256").update(serialized).digest("hex"),
    version: payload.version,
    approvedAt: payload.approvedAt,
    expiresAt: payload.expiresAt,
    requiredMigration: payload.requiredMigration,
    controls: Object.keys(payload.controls).length,
  }),
);
