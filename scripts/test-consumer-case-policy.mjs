import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import {
  addBusinessDays,
  addConsumerMessage,
  applyConsumerCaseAction,
  consumerCaseSummary,
  createConsumerCase,
} from "../consumer-case-policy.mjs";

const now = new Date("2026-07-17T12:00:00.000Z"),
  userId = randomUUID(),
  subjectHash = createHash("sha256").update(userId).digest("hex"),
  id = randomUUID(),
  created = createConsumerCase(
    {
      category: "refund",
      subject: "Refund request for my subscription",
      statement:
        "I am requesting a review of the most recent subscription charge and the service supplied.",
      desiredResolution: "Review and refund the eligible amount.",
      orderReference: "checkout/opaque-reference-2026",
      confirmAccuracy: true,
      confirmNoSecretsOrMedia: true,
      privacyAccepted: true,
    },
    {
      id,
      reference: `CP-${id.replace(/-/g, "").slice(0, 12).toUpperCase()}`,
      userId,
      subjectHash,
      contactEmail: "creator@example.com",
      now,
    },
  ),
  record = created.record;

assert.equal(record.status, "open");
assert.equal(record.refundDecision, "pending");
assert.equal(record.responseDueAt, "2026-07-21T12:00:00.000Z");
assert.equal(record.resolutionDueAt, "2026-08-07T12:00:00.000Z");
assert.equal(created.receivedEvent.actorType, "customer");
assert.equal(consumerCaseSummary(record).reference, record.reference);
assert.equal(
  addBusinessDays("2026-07-17T12:00:00.000Z", 1),
  "2026-07-20T12:00:00.000Z",
);

const acknowledged = applyConsumerCaseAction(
  record,
  { action: "acknowledge", note: "The request has been acknowledged." },
  { operatorReference: "operator-primary", now: new Date(now.getTime() + 60_000) },
);
assert.equal(record.status, "acknowledged");
assert.equal(acknowledged.type, "acknowledged");

const customerMessage = addConsumerMessage(
  record,
  {
    message: "Here is the additional account context requested for review.",
    confirmNoSecretsOrMedia: true,
  },
  {
    subjectHash,
    now: new Date(now.getTime() + 120_000),
  },
);
assert.equal(record.status, "in-review");
assert.equal(customerMessage.type, "customer-message");

applyConsumerCaseAction(
  record,
  {
    action: "refund-decision",
    note: "The refund request was reviewed against the service record.",
    refundDecision: "approved",
    refundAmountPence: 1900,
    decisionReference: "billing/refund-decision-2026-001",
  },
  { operatorReference: "operator-primary", now: new Date(now.getTime() + 180_000) },
);
assert.equal(record.refundDecision, "approved");
assert.equal(record.refundAmountPence, 1900);
assert.throws(
  () =>
    applyConsumerCaseAction(
      record,
      {
        action: "resolve",
        note: "Attempting resolution before the approved refund completed.",
        outcome: "The refund was approved after review.",
        remedy: "Refund",
      },
      { operatorReference: "operator-primary", now: new Date(now.getTime() + 240_000) },
    ),
  /completed refund/i,
);
applyConsumerCaseAction(
  record,
  {
    action: "refund-completed",
    note: "Stripe confirmed completion to the original payment method.",
    providerReference: "re_testrefund123",
  },
  { operatorReference: "operator-primary", now: new Date(now.getTime() + 300_000) },
);
applyConsumerCaseAction(
  record,
  {
    action: "resolve",
    note: "The request is resolved after refund completion.",
    outcome: "The eligible subscription payment was refunded.",
    remedy: "Refund to the original payment method",
  },
  { operatorReference: "operator-primary", now: new Date(now.getTime() + 360_000) },
);
assert.equal(record.status, "resolved");
applyConsumerCaseAction(
  record,
  { action: "close", note: "Closure recorded after resolution notification." },
  { operatorReference: "operator-primary", now: new Date(now.getTime() + 420_000) },
);
assert.equal(record.status, "closed");
assert.throws(
  () =>
    addConsumerMessage(
      record,
      { message: "A message after closure is not allowed.", confirmNoSecretsOrMedia: true },
      { subjectHash, now },
    ),
  /cannot receive/i,
);
assert.throws(
  () =>
    createConsumerCase(
      {
        category: "refund",
        subject: "Unsafe submission",
        statement: "This input lacks the mandatory safe submission confirmations.",
      },
      {
        id: randomUUID(),
        reference: "CP-AAAAAAAAAAAA",
        userId,
        subjectHash,
        contactEmail: "creator@example.com",
        now,
      },
    ),
  /confirmations are required/i,
);

console.log(
  JSON.stringify({
    ok: true,
    authenticatedAccountBinding: true,
    internalBusinessDayTargets: true,
    refundDecisionSeparatedFromCompletion: true,
    refundCompletionRequiredBeforeResolution: true,
    closedCaseFrozen: true,
    safeSubmissionConfirmed: true,
  }),
);
