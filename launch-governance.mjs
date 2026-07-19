import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";

import { COMPLIANCE_VERSIONS } from "./compliance-versions.mjs";

export const UK_LAUNCH_GOVERNANCE_KIND = "content-protect-uk-launch-governance";
export const UK_LAUNCH_GOVERNANCE_VERSION = "2026-07-20-v1";
export const UK_LAUNCH_GOVERNANCE_ALGORITHM = "ed25519";
export const UK_LAUNCH_GOVERNANCE_MAX_VALIDITY_DAYS = 370;
export const UK_LAUNCH_GOVERNANCE_CONTROLS = Object.freeze([
  "company_filings_current",
  "ico_registration_or_exemption",
  "dpia_and_special_category_basis",
  "processor_contracts_and_transfers",
  "incident_plan_and_tabletop",
  "independent_penetration_test",
  "retention_policy",
  "creator_safety_and_online_safety",
  "specialist_takedown_dispute_counsel",
  "consumer_terms_tax_and_complaints",
]);

const MAX_VALIDITY_MS =
  UK_LAUNCH_GOVERNANCE_MAX_VALIDITY_DAYS * 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required))
    throw new Error(`${label} has missing or unexpected fields.`);
}

function isoTimestamp(value, label) {
  const timestamp = String(value || "");
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== timestamp)
    throw new Error(`${label} must be a canonical UTC timestamp.`);
  return parsed;
}

function opaqueReference(value, label) {
  const reference = String(value || "");
  if (
    reference.length < 12 ||
    reference.length > 160 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]+$/.test(reference) ||
    /^https?:/i.test(reference) ||
    reference.includes("@")
  )
    throw new Error(`${label} must be an opaque retained-evidence reference.`);
  return reference;
}

function ed25519PrivateKey(value) {
  let key;
  try {
    key = value?.type === "private" ? value : createPrivateKey(value);
  } catch {
    throw new Error("The governance signing private key is invalid.");
  }
  if (key.asymmetricKeyType !== "ed25519")
    throw new Error("The governance signing key must be Ed25519.");
  return key;
}

function ed25519PublicKey(value) {
  let key;
  try {
    key = value?.type === "public" ? value : createPublicKey(value);
  } catch {
    throw new Error("The governance verification public key is invalid.");
  }
  if (key.asymmetricKeyType !== "ed25519")
    throw new Error("The governance verification key must be Ed25519.");
  return key;
}

export function buildLaunchGovernancePayload(
  input,
  { expectedMigration, complianceVersions = COMPLIANCE_VERSIONS } = {},
) {
  exactKeys(
    input,
    ["approvedAt", "expiresAt", "approverReference", "controls"],
    "Governance input",
  );
  if (!/^[0-9]{3}_[a-z0-9_]+\.sql$/.test(String(expectedMigration || "")))
    throw new Error("A valid required migration is required.");
  const approvedAt = isoTimestamp(input.approvedAt, "approvedAt");
  const expiresAt = isoTimestamp(input.expiresAt, "expiresAt");
  if (expiresAt <= approvedAt)
    throw new Error("expiresAt must be after approvedAt.");
  if (expiresAt.getTime() - approvedAt.getTime() > MAX_VALIDITY_MS)
    throw new Error(
      `Governance approval cannot exceed ${UK_LAUNCH_GOVERNANCE_MAX_VALIDITY_DAYS} days.`,
    );
  exactKeys(
    input.controls,
    UK_LAUNCH_GOVERNANCE_CONTROLS,
    "Governance controls",
  );
  const controls = Object.fromEntries(
    UK_LAUNCH_GOVERNANCE_CONTROLS.map((control) => [
      control,
      opaqueReference(input.controls[control], control),
    ]),
  );
  return {
    kind: UK_LAUNCH_GOVERNANCE_KIND,
    version: UK_LAUNCH_GOVERNANCE_VERSION,
    approvedAt: approvedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    approverReference: opaqueReference(
      input.approverReference,
      "approverReference",
    ),
    requiredMigration: expectedMigration,
    complianceVersions: { ...complianceVersions },
    controls,
  };
}

function validatePayload(
  payload,
  { expectedMigration, complianceVersions = COMPLIANCE_VERSIONS } = {},
) {
  exactKeys(
    payload,
    [
      "kind",
      "version",
      "approvedAt",
      "expiresAt",
      "approverReference",
      "requiredMigration",
      "complianceVersions",
      "controls",
    ],
    "Governance payload",
  );
  if (payload.kind !== UK_LAUNCH_GOVERNANCE_KIND)
    throw new Error("Governance manifest kind is invalid.");
  if (payload.version !== UK_LAUNCH_GOVERNANCE_VERSION)
    throw new Error("Governance manifest version is not current.");
  if (payload.requiredMigration !== expectedMigration)
    throw new Error("Governance manifest does not cover the current schema.");
  if (
    canonicalJson(payload.complianceVersions) !==
    canonicalJson(complianceVersions)
  )
    throw new Error(
      "Governance manifest does not cover the current compliance versions.",
    );
  const rebuilt = buildLaunchGovernancePayload(
    {
      approvedAt: payload.approvedAt,
      expiresAt: payload.expiresAt,
      approverReference: payload.approverReference,
      controls: payload.controls,
    },
    { expectedMigration, complianceVersions },
  );
  if (canonicalJson(rebuilt) !== canonicalJson(payload))
    throw new Error("Governance payload is not canonical.");
  return rebuilt;
}

export function signLaunchGovernancePayload(payload, privateKey) {
  const key = ed25519PrivateKey(privateKey);
  const bytes = Buffer.from(canonicalJson(payload));
  return {
    algorithm: UK_LAUNCH_GOVERNANCE_ALGORITHM,
    payload,
    signature: sign(null, bytes, key).toString("base64"),
  };
}

export function verifyLaunchGovernanceManifest(
  manifest,
  publicKey,
  { expectedMigration, complianceVersions = COMPLIANCE_VERSIONS } = {},
) {
  exactKeys(
    manifest,
    ["algorithm", "payload", "signature"],
    "Governance manifest",
  );
  if (manifest.algorithm !== UK_LAUNCH_GOVERNANCE_ALGORITHM)
    throw new Error("Governance signature algorithm is invalid.");
  const signature = Buffer.from(String(manifest.signature || ""), "base64");
  if (signature.length !== 64)
    throw new Error("Governance signature is invalid.");
  const payload = validatePayload(manifest.payload, {
    expectedMigration,
    complianceVersions,
  });
  const key = ed25519PublicKey(publicKey);
  const bytes = Buffer.from(canonicalJson(payload));
  if (!verify(null, bytes, key, signature))
    throw new Error("Governance signature verification failed.");
  return payload;
}

function emptyStatus(status, reason) {
  return {
    approved: false,
    status,
    reason,
    version: UK_LAUNCH_GOVERNANCE_VERSION,
    expiresAt: null,
    missingControls: [...UK_LAUNCH_GOVERNANCE_CONTROLS],
  };
}

export function launchGovernanceStatus(
  env = process.env,
  {
    expectedMigration,
    complianceVersions = COMPLIANCE_VERSIONS,
    now = new Date(),
  } = {},
) {
  const manifestValue = env.UK_LAUNCH_GOVERNANCE_MANIFEST,
    publicKey = env.UK_LAUNCH_GOVERNANCE_PUBLIC_KEY;
  if (!manifestValue && !publicKey)
    return emptyStatus("unconfigured", "approval-manifest-missing");
  if (!manifestValue || !publicKey)
    return emptyStatus("invalid", "partial-configuration");
  let manifest, payload;
  try {
    manifest = JSON.parse(manifestValue);
    payload = verifyLaunchGovernanceManifest(manifest, publicKey, {
      expectedMigration,
      complianceVersions,
    });
  } catch {
    return emptyStatus("invalid", "signature-or-policy-invalid");
  }
  const evaluatedAt = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(evaluatedAt.getTime()))
    return emptyStatus("invalid", "evaluation-time-invalid");
  const approvedAt = new Date(payload.approvedAt),
    expiresAt = new Date(payload.expiresAt);
  if (approvedAt.getTime() > evaluatedAt.getTime() + FUTURE_SKEW_MS)
    return emptyStatus("invalid", "approval-is-in-the-future");
  if (expiresAt <= evaluatedAt)
    return {
      ...emptyStatus("expired", "approval-expired"),
      expiresAt: payload.expiresAt,
    };
  return {
    approved: true,
    status: "approved",
    reason: null,
    version: payload.version,
    approvedAt: payload.approvedAt,
    expiresAt: payload.expiresAt,
    requiredMigration: payload.requiredMigration,
    manifestDigest: createHash("sha256")
      .update(canonicalJson(manifest))
      .digest("hex"),
    missingControls: [],
  };
}
