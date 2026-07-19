import { COMPLIANCE_VERSIONS } from "./compliance-versions.mjs";

export const DISPUTE_INTAKE_VERSION = COMPLIANCE_VERSIONS.disputeIntake;

export const DISPUTE_CATEGORIES = new Set([
  "ownership",
  "authorisation",
  "wrong-content",
  "licence",
  "fair-dealing",
  "other",
]);

const RECEIVED_EVENT = "Dispute received — follow-ups frozen";
const RESOLVED_EVENT = "Dispute resolved";
const ESCALATED_EVENT = "Dispute escalated for counsel review";
const DISPUTABLE_STATUSES = new Set([
  "Submitted — awaiting delivery confirmation",
  "Delivered — monitoring",
  "Delivery complaint — review required",
  "Disputed — review required",
  "Dispute — counsel review required",
  "Removed",
]);

export class DisputePolicyError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "DisputePolicyError";
    this.status = status;
  }
}

function safeHttpsUrl(value, { optional = false } = {}) {
  if (optional && !String(value || "").trim()) return null;
  try {
    const url = new URL(String(value || "").trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !url.hostname
    )
      throw new Error();
    url.hash = "";
    return url.href;
  } catch {
    throw new DisputePolicyError("Use a valid public HTTPS URL.");
  }
}

function cleanText(value, { min, max, label }) {
  const text = String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (text.length < min || text.length > max)
    throw new DisputePolicyError(
      `${label} must contain between ${min} and ${max} characters.`,
    );
  return text;
}

export function validateDisputeIntake(input, caseRecord) {
  const caseReference = String(input?.caseReference || "").trim(),
    reportedUrl = safeHttpsUrl(input?.reportedUrl),
    email = String(input?.email || "")
      .trim()
      .toLowerCase(),
    country = String(input?.country || "")
      .trim()
      .toUpperCase(),
    category = String(input?.category || ""),
    statement = cleanText(input?.statement, {
      min: 40,
      max: 4000,
      label: "Dispute statement",
    }),
    supportingUrl = safeHttpsUrl(input?.supportingUrl, { optional: true });
  if (!/^[0-9a-f-]{36}$/i.test(caseReference))
    throw new DisputePolicyError("Enter the case reference from the notice.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    throw new DisputePolicyError("Enter a valid safe contact email.");
  if (!/^[A-Z]{2}$/.test(country))
    throw new DisputePolicyError("Enter a two-letter country code.");
  if (!DISPUTE_CATEGORIES.has(category))
    throw new DisputePolicyError("Choose a valid dispute reason.");
  if (
    input?.confirmAccuracy !== true ||
    input?.confirmAuthority !== true ||
    input?.confirmNoSensitiveAttachments !== true ||
    input?.privacyAccepted !== true
  )
    throw new DisputePolicyError(
      "Accuracy, authority, safe-submission and privacy confirmations are required.",
    );
  if (
    !caseRecord ||
    caseRecord.id !== caseReference ||
    caseRecord.targetUrl !== reportedUrl ||
    !DISPUTABLE_STATUSES.has(caseRecord.status) ||
    !(
      caseRecord.providerMessageId ||
      caseRecord.submittedAt ||
      caseRecord.deliveredAt
    )
  )
    return null;
  return {
    version: DISPUTE_INTAKE_VERSION,
    caseReference,
    reportedUrl,
    email,
    country,
    category,
    statement,
    supportingUrl,
  };
}

export function receivedDisputeEvents(caseRecord) {
  return (caseRecord?.timeline || [])
    .filter((event) => event.event === RECEIVED_EVENT)
    .map((event) => ({
      disputeId: event.details?.disputeId,
      version: event.details?.version,
      category: event.details?.category,
      country: event.details?.country,
      contactHash: event.details?.contactHash,
      statementChecksum: event.details?.statementChecksum,
      ciphertext: event.details?.ciphertext,
      previousStatus: event.details?.previousStatus,
      receivedAt: event.at,
    }))
    .filter(
      (item) =>
        /^[0-9a-f-]{36}$/i.test(item.disputeId || "") &&
        item.version === DISPUTE_INTAKE_VERSION &&
        DISPUTE_CATEGORIES.has(item.category) &&
        /^[A-Z]{2}$/.test(item.country || "") &&
        /^[a-f0-9]{64}$/.test(item.contactHash || "") &&
        /^[a-f0-9]{64}$/.test(item.statementChecksum || "") &&
        typeof item.ciphertext === "string" &&
        item.ciphertext.length >= 40 &&
        Number.isFinite(Date.parse(item.receivedAt || "")),
    );
}

export function openDisputes(caseRecord) {
  const resolved = new Set(
    (caseRecord?.timeline || [])
      .filter((event) => event.event === RESOLVED_EVENT)
      .map((event) => event.details?.disputeId),
  );
  return receivedDisputeEvents(caseRecord).filter(
    (item) => !resolved.has(item.disputeId),
  );
}

export function disputeSummaries(caseRecord) {
  const open = new Set(openDisputes(caseRecord).map((item) => item.disputeId));
  return receivedDisputeEvents(caseRecord).map((item) => ({
    disputeId: item.disputeId,
    version: item.version,
    category: item.category,
    country: item.country,
    statementChecksum: item.statementChecksum,
    receivedAt: item.receivedAt,
    status: open.has(item.disputeId) ? "open" : "resolved",
  }));
}

export function disputeReceivedEvent({
  disputeId,
  intake,
  contactHash,
  statementChecksum,
  ciphertext,
  previousStatus,
  receivedAt = new Date().toISOString(),
}) {
  if (
    !/^[0-9a-f-]{36}$/i.test(disputeId || "") ||
    intake?.version !== DISPUTE_INTAKE_VERSION ||
    !/^[a-f0-9]{64}$/.test(contactHash || "") ||
    !/^[a-f0-9]{64}$/.test(statementChecksum || "") ||
    typeof ciphertext !== "string" ||
    ciphertext.length < 40 ||
    !Number.isFinite(Date.parse(receivedAt))
  )
    throw new DisputePolicyError("Dispute evidence is invalid.", 409);
  return {
    event: RECEIVED_EVENT,
    details: {
      disputeId,
      version: intake.version,
      category: intake.category,
      country: intake.country,
      contactHash,
      statementChecksum,
      ciphertext,
      previousStatus,
    },
    at: new Date(receivedAt).toISOString(),
  };
}

export function disputeReview(input, dispute) {
  if (!dispute) throw new DisputePolicyError("The dispute is not open.", 409);
  const action = String(input?.action || ""),
    reviewNote = cleanText(input?.reviewNote, {
      min: 20,
      max: 1000,
      label: "Review note",
    }),
    counselReference = String(input?.counselReference || "")
      .trim()
      .slice(0, 160);
  if (!new Set(["accept", "continue", "escalate"]).has(action))
    throw new DisputePolicyError("Choose a valid dispute outcome.");
  if (action === "accept" && input?.confirmCaseClosure !== true)
    throw new DisputePolicyError("Confirm case closure after the dispute.");
  if (
    ["accept", "continue"].includes(action) &&
    input?.confirmCreatorNotified !== true
  )
    throw new DisputePolicyError(
      "Confirm that the creator was notified of the reviewed outcome.",
    );
  if (
    action === "continue" &&
    (input?.confirmCounselApproval !== true ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,159}$/.test(counselReference))
  )
    throw new DisputePolicyError(
      "A qualified-counsel approval reference is required before continuation.",
    );
  return { action, reviewNote, counselReference: counselReference || null };
}

export function disputeReviewEvent({
  disputeId,
  review,
  operatorReference,
  reviewedAt = new Date().toISOString(),
}) {
  return {
    event: review.action === "escalate" ? ESCALATED_EVENT : RESOLVED_EVENT,
    details: {
      disputeId,
      outcome: review.action,
      reviewNote: review.reviewNote,
      counselReference: review.counselReference,
      operatorReference,
    },
    at: new Date(reviewedAt).toISOString(),
  };
}
