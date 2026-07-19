import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { COMPLIANCE_VERSIONS } from "../compliance-versions.mjs";
import {
  buildLaunchGovernancePayload,
  launchGovernanceStatus,
  signLaunchGovernancePayload,
  UK_LAUNCH_GOVERNANCE_CONTROLS,
  verifyLaunchGovernanceManifest,
} from "../launch-governance.mjs";
import { REQUIRED_MIGRATION } from "../operations-readiness.mjs";

const { privateKey, publicKey } = generateKeyPairSync("ed25519"),
  now = new Date("2026-07-20T12:00:00.000Z"),
  input = {
    approvedAt: "2026-07-20T11:00:00.000Z",
    expiresAt: "2027-07-20T11:00:00.000Z",
    approverReference: "governance/board-approval-2026-v1",
    controls: Object.fromEntries(
      UK_LAUNCH_GOVERNANCE_CONTROLS.map((control) => [
        control,
        `evidence/${control}/2026-v1`,
      ]),
    ),
  },
  payload = buildLaunchGovernancePayload(input, {
    expectedMigration: REQUIRED_MIGRATION,
  }),
  manifest = signLaunchGovernancePayload(payload, privateKey),
  env = {
    UK_LAUNCH_GOVERNANCE_MANIFEST: JSON.stringify(manifest),
    UK_LAUNCH_GOVERNANCE_PUBLIC_KEY: publicKey.export({
      type: "spki",
      format: "pem",
    }),
  };

assert.deepEqual(
  verifyLaunchGovernanceManifest(
    manifest,
    env.UK_LAUNCH_GOVERNANCE_PUBLIC_KEY,
    {
      expectedMigration: REQUIRED_MIGRATION,
    },
  ),
  payload,
);
const approved = launchGovernanceStatus(env, {
  expectedMigration: REQUIRED_MIGRATION,
  now,
});
assert.equal(approved.approved, true);
assert.equal(approved.status, "approved");
assert.equal(approved.missingControls.length, 0);
assert.match(approved.manifestDigest, /^[a-f0-9]{64}$/);
assert.equal(JSON.stringify(approved).includes("evidence/"), false);

const tampered = {
  ...manifest,
  payload: {
    ...manifest.payload,
    expiresAt: "2027-07-19T11:00:00.000Z",
  },
};
assert.throws(
  () =>
    verifyLaunchGovernanceManifest(
      tampered,
      env.UK_LAUNCH_GOVERNANCE_PUBLIC_KEY,
      { expectedMigration: REQUIRED_MIGRATION },
    ),
  /signature verification failed/i,
);
assert.equal(
  launchGovernanceStatus(
    { ...env, UK_LAUNCH_GOVERNANCE_MANIFEST: JSON.stringify(tampered) },
    { expectedMigration: REQUIRED_MIGRATION, now },
  ).status,
  "invalid",
);
assert.equal(
  launchGovernanceStatus(
    { UK_LAUNCH_GOVERNANCE_MANIFEST: JSON.stringify(manifest) },
    { expectedMigration: REQUIRED_MIGRATION, now },
  ).reason,
  "partial-configuration",
);
assert.equal(
  launchGovernanceStatus(env, {
    expectedMigration: REQUIRED_MIGRATION,
    now: "2027-07-20T11:00:00.000Z",
  }).status,
  "expired",
);
assert.equal(
  launchGovernanceStatus(env, {
    expectedMigration: "020_future_schema.sql",
    now,
  }).status,
  "invalid",
);
assert.equal(
  launchGovernanceStatus(env, {
    expectedMigration: REQUIRED_MIGRATION,
    complianceVersions: {
      ...COMPLIANCE_VERSIONS,
      privacyNotice: "future-version",
    },
    now,
  }).status,
  "invalid",
);
assert.throws(
  () =>
    buildLaunchGovernancePayload(
      {
        ...input,
        controls: {
          ...input.controls,
          company_filings_current: "https://example.com/not-opaque",
        },
      },
      { expectedMigration: REQUIRED_MIGRATION },
    ),
  /opaque retained-evidence reference/i,
);
assert.throws(
  () =>
    buildLaunchGovernancePayload(
      {
        ...input,
        expiresAt: "2027-08-01T11:00:00.000Z",
      },
      { expectedMigration: REQUIRED_MIGRATION },
    ),
  /cannot exceed/i,
);
assert.throws(
  () =>
    buildLaunchGovernancePayload(
      {
        ...input,
        controls: Object.fromEntries(Object.entries(input.controls).slice(1)),
      },
      { expectedMigration: REQUIRED_MIGRATION },
    ),
  /missing or unexpected/i,
);

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  temporaryDirectory = await mkdtemp(
    join(tmpdir(), "content-protect-governance-"),
  ),
  inputPath = join(temporaryDirectory, "input.json"),
  privateKeyPath = join(temporaryDirectory, "private.pem"),
  outputPath = join(temporaryDirectory, "manifest.json"),
  signerPath = resolve(
    repositoryRoot,
    "scripts/create-launch-governance-manifest.mjs",
  );
try {
  await Promise.all([
    writeFile(inputPath, JSON.stringify(input), { mode: 0o600 }),
    writeFile(
      privateKeyPath,
      privateKey.export({ type: "pkcs8", format: "pem" }),
      { mode: 0o600 },
    ),
  ]);
  const signed = spawnSync(
    process.execPath,
    [signerPath, inputPath, privateKeyPath, outputPath],
    { encoding: "utf8" },
  );
  assert.equal(signed.status, 0, signed.stderr);
  assert.equal(signed.stdout.includes("evidence/"), false);
  const created = JSON.parse(await readFile(outputPath, "utf8"));
  assert.deepEqual(
    verifyLaunchGovernanceManifest(
      created,
      env.UK_LAUNCH_GOVERNANCE_PUBLIC_KEY,
      { expectedMigration: REQUIRED_MIGRATION },
    ),
    payload,
  );
  const overwrite = spawnSync(
    process.execPath,
    [signerPath, inputPath, privateKeyPath, outputPath],
    { encoding: "utf8" },
  );
  assert.notEqual(overwrite.status, 0);
  assert.match(overwrite.stderr, /EEXIST|file already exists/i);
  const repositoryOutput = resolve(
      repositoryRoot,
      ".forbidden-governance-manifest.json",
    ),
    insideRepository = spawnSync(
      process.execPath,
      [signerPath, inputPath, privateKeyPath, repositoryOutput],
      { encoding: "utf8" },
    );
  assert.notEqual(insideRepository.status, 0);
  assert.match(insideRepository.stderr, /outside the repository/i);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

console.log(
  JSON.stringify({
    ok: true,
    asymmetricSignatureRequired: true,
    privateKeyExcludedFromRuntime: true,
    exactControlSetRequired: true,
    schemaAndComplianceVersionBound: true,
    expiryRequired: true,
    publicStatusMinimised: true,
    signerRefusesRepositoryPaths: true,
    signerRefusesOverwrite: true,
    signerOutputMinimised: true,
  }),
);
