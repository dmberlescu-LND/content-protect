import { randomUUID } from "node:crypto";

export const CONSUMER_CASE_CATEGORIES = Object.freeze([
  "billing",
  "cancellation",
  "cooling-off",
  "refund",
  "service",
  "privacy",
  "accessibility",
  "safety",
  "other",
]);

const CATEGORY_SET = new Set(CONSUMER_CASE_CATEGORIES);
const REFUND_CATEGORIES = new Set(["billing", "cooling-off", "refund"]);
const OPEN_STATUSES = new Set([
  "open",
  "acknowledged",
  "in-review",
  "awaiting-customer",
]);
const REFUND_DECISIONS = new Set(["approved", "partial", "declined"]);

export class ConsumerCasePolicyError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ConsumerCasePolicyError";
    this.status = status;
  }
}

function clean(value, { label, min, max, optional = false }) {
  const text = String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (optional && !text) return null;
  if (text.length < min || text.length > max)
    throw new ConsumerCasePolicyError(
      `${label} must contain between ${min} and ${max} characters.`,
    );
  return text;
}

function opaqueReference(value, label, { optional = false } = {}) {
  const reference = String(value || "").trim();
  if (optional && !reference) return null;
  if (
    reference.length < 3 ||
    reference.length > 160 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]+$/.test(reference) ||
    /^https?:/i.test(reference) ||
    reference.includes("@")
  )
    throw new ConsumerCasePolicyError(
      `${label} must be an opaque record reference.`,
    );
  return reference;
}

export function addBusinessDays(value, days) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || !Number.isInteger(days) || days < 0)
    throw new ConsumerCasePolicyError("The service target is invalid.");
  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (![0, 6].includes(date.getUTCDay())) remaining -= 1;
  }
  return date.toISOString();
}

function event(type, actorType, actorReference, restricted, now) {
  return {
    id: randomUUID(),
    type,
    actorType,
    actorReference,
    at: now.toISOString(),
    restricted,
  };
}

export function createConsumerCase(
  input,
  { id, reference, userId, subjectHash, contactEmail, now = new Date() },
) {
  const category = String(input?.category || "");
  if (!CATEGORY_SET.has(category))
    throw new ConsumerCasePolicyError("Choose a valid request category.");
  if (
    input?.confirmAccuracy !== true ||
    input?.confirmNoSecretsOrMedia !== true ||
    input?.privacyAccepted !== true
  )
    throw new ConsumerCasePolicyError(
      "Accuracy, privacy and safe-submission confirmations are required.",
    );
  if (!/^[0-9a-f-]{36}$/i.test(String(id || "")))
    throw new ConsumerCasePolicyError("The case identifier is invalid.", 409);
  if (!/^CP-[A-F0-9]{12}$/.test(String(reference || "")))
    throw new ConsumerCasePolicyError("The case reference is invalid.", 409);
  if (!/^[0-9a-f-]{36}$/i.test(String(userId || "")))
    throw new ConsumerCasePolicyError("The account binding is invalid.", 409);
  if (!/^[a-f0-9]{64}$/.test(String(subjectHash || "")))
    throw new ConsumerCasePolicyError("The account subject is invalid.", 409);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(contactEmail || "")))
    throw new ConsumerCasePolicyError("The contact binding is invalid.", 409);
  const createdAt = new Date(now);
  if (!Number.isFinite(createdAt.getTime()))
    throw new ConsumerCasePolicyError("The case timestamp is invalid.", 409);
  const restricted = {
      id,
      userId,
      category,
      contactEmail: String(contactEmail).toLowerCase(),
      subject: clean(input.subject, {
        label: "Subject",
        min: 8,
        max: 120,
      }),
      statement: clean(input.statement, {
        label: "Statement",
        min: 30,
        max: 4000,
      }),
      desiredResolution: clean(input.desiredResolution, {
        label: "Desired resolution",
        min: 3,
        max: 1000,
        optional: true,
      }),
      orderReference: opaqueReference(input.orderReference, "Order reference", {
        optional: true,
      }),
    },
    record = {
      id,
      reference,
      userId,
      subjectHash,
      category,
      priority: category === "safety" ? "urgent" : "standard",
      status: "open",
      responseDueAt: addBusinessDays(createdAt, 2),
      resolutionDueAt: addBusinessDays(createdAt, 15),
      refundDecision: REFUND_CATEGORIES.has(category)
        ? "pending"
        : "not-requested",
      refundAmountPence: null,
      refundCompletedAt: null,
      resolvedAt: null,
      closedAt: null,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
    },
    receivedEvent = event(
      "received",
      "customer",
      subjectHash,
      { message: "Consumer request received through the authenticated portal." },
      createdAt,
    );
  return { record, restricted, receivedEvent };
}

export function addConsumerMessage(
  caseRecord,
  input,
  { subjectHash, now = new Date() },
) {
  if (!OPEN_STATUSES.has(caseRecord?.status))
    throw new ConsumerCasePolicyError(
      "This case cannot receive another customer message.",
      409,
    );
  if (caseRecord.subjectHash !== subjectHash)
    throw new ConsumerCasePolicyError("The account binding is invalid.", 403);
  const message = clean(input?.message, {
    label: "Message",
    min: 10,
    max: 3000,
  });
  if (input?.confirmNoSecretsOrMedia !== true)
    throw new ConsumerCasePolicyError(
      "Confirm that the message contains no password or private media.",
    );
  caseRecord.status = "in-review";
  caseRecord.updatedAt = now.toISOString();
  return event(
    "customer-message",
    "customer",
    subjectHash,
    { message },
    now,
  );
}

export function applyConsumerCaseAction(
  caseRecord,
  input,
  { operatorReference, now = new Date() },
) {
  const action = String(input?.action || "");
  if (caseRecord?.status === "closed")
    throw new ConsumerCasePolicyError("The consumer case is closed.", 409);
  const note = clean(input?.note, {
    label: "Operator note",
    min: 10,
    max: 2000,
  });
  const restricted = { note };
  let type;
  if (action === "acknowledge") {
    if (caseRecord.status !== "open")
      throw new ConsumerCasePolicyError(
        "Only a new case can be acknowledged.",
        409,
      );
    caseRecord.status = "acknowledged";
    type = "acknowledged";
  } else if (action === "request-information") {
    if (!OPEN_STATUSES.has(caseRecord.status))
      throw new ConsumerCasePolicyError("The case is not open.", 409);
    caseRecord.status = "awaiting-customer";
    type = "information-requested";
  } else if (action === "refund-decision") {
    if (!REFUND_CATEGORIES.has(caseRecord.category))
      throw new ConsumerCasePolicyError(
        "This case does not contain a refund request.",
        409,
      );
    const decision = String(input.refundDecision || "");
    if (!REFUND_DECISIONS.has(decision))
      throw new ConsumerCasePolicyError("Choose a valid refund decision.");
    const amount = Number(input.refundAmountPence);
    if (
      ["approved", "partial"].includes(decision) &&
      (!Number.isSafeInteger(amount) || amount < 1 || amount > 100_000_000)
    )
      throw new ConsumerCasePolicyError(
        "Enter the approved refund amount in whole pence.",
      );
    caseRecord.refundDecision = decision;
    caseRecord.refundAmountPence = ["approved", "partial"].includes(decision)
      ? amount
      : null;
    caseRecord.status = "in-review";
    restricted.refundDecision = decision;
    restricted.decisionReference = opaqueReference(
      input.decisionReference,
      "Decision reference",
    );
    type = "refund-decision";
  } else if (action === "refund-completed") {
    if (!new Set(["approved", "partial"]).has(caseRecord.refundDecision))
      throw new ConsumerCasePolicyError(
        "Record an approved refund decision first.",
        409,
      );
    const providerReference = opaqueReference(
      input.providerReference,
      "Provider refund reference",
    );
    if (!/^re_[A-Za-z0-9]+$/.test(providerReference))
      throw new ConsumerCasePolicyError(
        "Use the Stripe refund reference returned after completion.",
      );
    caseRecord.refundCompletedAt = now.toISOString();
    caseRecord.status = "in-review";
    restricted.providerReference = providerReference;
    restricted.amountPence = caseRecord.refundAmountPence;
    type = "refund-completed";
  } else if (action === "resolve") {
    if (!OPEN_STATUSES.has(caseRecord.status))
      throw new ConsumerCasePolicyError("The case is not open.", 409);
    if (
      ["approved", "partial"].includes(caseRecord.refundDecision) &&
      !caseRecord.refundCompletedAt
    )
      throw new ConsumerCasePolicyError(
        "Record the completed refund before resolving this case.",
        409,
      );
    restricted.outcome = clean(input.outcome, {
      label: "Outcome",
      min: 20,
      max: 2000,
    });
    restricted.remedy = clean(input.remedy, {
      label: "Remedy",
      min: 3,
      max: 1000,
    });
    caseRecord.status = "resolved";
    caseRecord.resolvedAt = now.toISOString();
    type = "resolved";
  } else if (action === "close") {
    if (caseRecord.status !== "resolved")
      throw new ConsumerCasePolicyError(
        "Resolve the case before closing it.",
        409,
      );
    caseRecord.status = "closed";
    caseRecord.closedAt = now.toISOString();
    type = "closed";
  } else {
    throw new ConsumerCasePolicyError("Choose a valid operator action.");
  }
  caseRecord.updatedAt = now.toISOString();
  return event(type, "operator", operatorReference, restricted, now);
}

export function consumerCaseSummary(caseRecord) {
  return {
    id: caseRecord.id,
    reference: caseRecord.reference,
    category: caseRecord.category,
    priority: caseRecord.priority,
    status: caseRecord.status,
    responseDueAt: caseRecord.responseDueAt,
    resolutionDueAt: caseRecord.resolutionDueAt,
    refundDecision: caseRecord.refundDecision,
    refundAmountPence: caseRecord.refundAmountPence,
    refundCompletedAt: caseRecord.refundCompletedAt,
    resolvedAt: caseRecord.resolvedAt,
    closedAt: caseRecord.closedAt,
    createdAt: caseRecord.createdAt,
    updatedAt: caseRecord.updatedAt,
  };
}
