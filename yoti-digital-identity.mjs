import { createPrivateKey } from "node:crypto";
import yoti from "yoti";
import { installedYotiDependencySecurity } from "./yoti-dependency-security.mjs";

const {
  DigitalIdentityClient,
  DigitalIdentityBuilders: { PolicyBuilder, ShareSessionConfigurationBuilder },
} = yoti;

export const YOTI_SHARE_ID = /^[A-Za-z0-9_-]{16,160}$/;
const SANDBOX_APPROVAL_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/;

function normalizedEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function yotiSandboxTestConfiguration(env = process.env) {
  const emails = [
      ...new Set(
        String(env.YOTI_SANDBOX_TEST_EMAILS || "")
          .split(",")
          .map(normalizedEmail)
          .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
      ),
    ],
    approvalReference = String(
      env.YOTI_SANDBOX_TEST_APPROVAL_REFERENCE || "",
    ).trim();
  return {
    configured: Boolean(
      env.YOTI_MODE === "sandbox" &&
      emails.length &&
      SANDBOX_APPROVAL_REFERENCE.test(approvalReference),
    ),
    emails,
    approvalReference,
  };
}

export function yotiSandboxTestAllowed(configuration, email) {
  return Boolean(
    configuration?.configured &&
    configuration.emails?.includes(normalizedEmail(email)),
  );
}

export function normalizedYotiPrivateKey(value) {
  return String(value || "")
    .replace(/\\n/g, "\n")
    .trim();
}

export function yotiConfiguration(
  env = process.env,
  dependencySecurity = installedYotiDependencySecurity(),
) {
  const sdkId = String(env.YOTI_SDK_ID || "").trim(),
    privateKey = normalizedYotiPrivateKey(env.YOTI_PRIVATE_KEY);
  if (!sdkId && !privateKey) return { configured: false };
  if (!sdkId || !privateKey)
    throw new Error("Yoti configuration requires both SDK ID and private key.");
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(sdkId))
    throw new Error("YOTI_SDK_ID is invalid.");
  try {
    createPrivateKey(privateKey);
  } catch {
    throw new Error("YOTI_PRIVATE_KEY is not a valid PEM private key.");
  }
  if (env.YOTI_MODE === "live" && !dependencySecurity?.secure)
    return { configured: false, reason: "dependency-security-blocked" };
  return { configured: true, sdkId, privateKey };
}

export function createYotiDigitalIdentityClient(configuration) {
  if (!configuration?.configured)
    throw new Error("Yoti Digital Identity is not configured.");
  return new DigitalIdentityClient(
    configuration.sdkId,
    configuration.privateKey,
  );
}

export function buildYotiAgeShareConfiguration({ userId, redirectUrl }) {
  const policy = new PolicyBuilder().withAgeOver(18, null, false).build(),
    subject = { subject_id: userId };
  return new ShareSessionConfigurationBuilder()
    .withRedirectUri(redirectUrl)
    .withPolicy(policy)
    .withSubject(subject)
    .build();
}

export function interpretYotiAgeReceipt(
  receipt,
  { sessionId, receiptId, createdAt, expiresAt, now = new Date() },
) {
  const actualSessionId = receipt?.getSessionId?.(),
    actualReceiptId = receipt?.getReceiptId?.(),
    timestamp = receipt?.getTimestamp?.();
  if (
    actualSessionId !== sessionId ||
    actualReceiptId !== receiptId ||
    !(timestamp instanceof Date) ||
    !Number.isFinite(timestamp.getTime())
  )
    return { accepted: false, status: "mismatch" };
  const created = new Date(createdAt),
    expires = new Date(expiresAt),
    current = new Date(now);
  if (
    !Number.isFinite(created.getTime()) ||
    !Number.isFinite(expires.getTime()) ||
    timestamp < new Date(created.getTime() - 5 * 60_000) ||
    timestamp > new Date(current.getTime() + 5 * 60_000) ||
    current > expires
  )
    return { accepted: false, status: "expired" };
  if (receipt.getError?.()) return { accepted: false, status: "failed" };
  const attribute = receipt.getProfile?.()?.findAgeOverVerification?.(18),
    verification = attribute?.getValue?.(),
    sourceCount = (attribute?.getSources?.() || []).length,
    verifierCount = (attribute?.getVerifiers?.() || []).length,
    accepted = Boolean(
      verification?.getCheckType?.() === "age_over" &&
      verification?.getAge?.() === 18 &&
      verification?.getResult?.() === true &&
      sourceCount + verifierCount > 0,
    );
  return {
    accepted,
    status: accepted ? "verified" : "failed",
    method: "YOTI_DIGITAL_IDENTITY",
    threshold: 18,
    receiptTimestamp: timestamp.toISOString(),
  };
}

export function yotiReceiptAlreadyUsed(records, receiptId, currentRecordId) {
  return (records || []).some(
    (item) =>
      item.id !== currentRecordId && item.evidence?.receiptId === receiptId,
  );
}
