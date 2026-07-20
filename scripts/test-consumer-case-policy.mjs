import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import {
  addBusinessDays,
  addConsumerMessage,
  applyConsumerCaseAction,
  applyConsumerRefundProviderResult,
  consumerCaseSummary,
  createConsumerCase,
} from "../consumer-case-policy.mjs";

const now = new Date("2026-07-17T12:00:00.000Z"),
  userId = randomUUID(),
  subjectHash = createHash("sha256").update(userId).digest("hex"),
  id = randomUUID(),
  stripeInvoiceBinding = {
    invoicePaymentReference: "inpay_verified123",
    invoiceReference: "in_verified123",
    subscriptionReference: "sub_verified123",
  },
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
const pendingDecisionRecord = structuredClone(record);
assert.throws(
  () =>
    applyConsumerCaseAction(
      pendingDecisionRecord,
      {
        action: "resolve",
        note: "Attempting resolution before a refund decision was recorded.",
        outcome: "The request cannot yet have a final outcome.",
        remedy: "Decision required",
      },
      { operatorReference: "operator-primary", now },
    ),
  /refund decision/i,
);

const acknowledged = applyConsumerCaseAction(
  record,
  { action: "acknowledge", note: "The request has been acknowledged." },
  {
    operatorReference: "operator-primary",
    now: new Date(now.getTime() + 60_000),
  },
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
  {
    operatorReference: "operator-primary",
    now: new Date(now.getTime() + 180_000),
  },
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
      {
        operatorReference: "operator-primary",
        now: new Date(now.getTime() + 240_000),
      },
    ),
  /completed refund/i,
);
assert.throws(
  () =>
    applyConsumerCaseAction(
      record,
      {
        action: "refund-completed",
        note: "A manually entered completion must never be accepted.",
        providerReference: "re_testrefund123",
      },
      {
        operatorReference: "operator-primary",
        now: new Date(now.getTime() + 300_000),
      },
    ),
  /verified directly with Stripe/i,
);
const recordBeforeInvalidProviderResult = structuredClone(record);
assert.throws(
  () =>
    applyConsumerRefundProviderResult(
      record,
      {
        providerStatus: "pending",
        providerReference: "re_testrefund123",
        paymentIntentReference: "pi_testpayment123",
        amountPence: 1900,
        attempt: 1,
        note: "Stripe returned incomplete subscription invoice evidence.",
      },
      {
        operatorReference: "operator-primary",
        now: new Date(now.getTime() + 300_000),
      },
    ),
  /invoice payment reference is invalid/i,
);
assert.deepEqual(record, recordBeforeInvalidProviderResult);
const submitted = applyConsumerRefundProviderResult(
  record,
  {
    ...stripeInvoiceBinding,
    providerStatus: "pending",
    providerReference: "re_testrefund123",
    paymentIntentReference: "pi_testpayment123",
    amountPence: 1900,
    attempt: 1,
    note: "Stripe accepted the approved refund for provider processing.",
  },
  {
    operatorReference: "operator-primary",
    now: new Date(now.getTime() + 300_000),
  },
);
assert.equal(submitted.type, "refund-submitted");
assert.equal(record.refundCompletedAt, null);
const completed = applyConsumerRefundProviderResult(
  record,
  {
    ...stripeInvoiceBinding,
    providerStatus: "succeeded",
    providerReference: "re_testrefund123",
    paymentIntentReference: "pi_testpayment123",
    amountPence: 1900,
    attempt: 1,
    note: "Stripe now verifies completion to the original payment method.",
  },
  {
    operatorReference: "operator-primary",
    now: new Date(now.getTime() + 330_000),
  },
);
assert.equal(completed.type, "refund-status-changed");
assert.equal(record.refundProviderStatus, "succeeded");
applyConsumerCaseAction(
  record,
  {
    action: "resolve",
    note: "The request is resolved after refund completion.",
    outcome: "The eligible subscription payment was refunded.",
    remedy: "Refund to the original payment method",
  },
  {
    operatorReference: "operator-primary",
    now: new Date(now.getTime() + 360_000),
  },
);
assert.equal(record.status, "resolved");
applyConsumerCaseAction(
  record,
  { action: "close", note: "Closure recorded after resolution notification." },
  {
    operatorReference: "operator-primary",
    now: new Date(now.getTime() + 420_000),
  },
);
assert.equal(record.status, "closed");
assert.throws(
  () =>
    addConsumerMessage(
      record,
      {
        message: "A message after closure is not allowed.",
        confirmNoSecretsOrMedia: true,
      },
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
        statement:
          "This input lacks the mandatory safe submission confirmations.",
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

const legacy = createConsumerCase(
  {
    category: "refund",
    subject: "Historical refund reconciliation",
    statement:
      "This case represents a historical refund completion that must be verified against Stripe.",
    confirmAccuracy: true,
    confirmNoSecretsOrMedia: true,
    privacyAccepted: true,
  },
  {
    id: randomUUID(),
    reference: "CP-BBBBBBBBBBBB",
    userId,
    subjectHash,
    contactEmail: "creator@example.com",
    now,
  },
).record;
applyConsumerCaseAction(
  legacy,
  {
    action: "refund-decision",
    note: "Historical decision evidence authorises the recorded refund amount.",
    refundDecision: "approved",
    refundAmountPence: 1200,
    decisionReference: "billing/legacy-refund-decision-001",
  },
  { operatorReference: "operator-primary", now },
);
legacy.refundProviderStatus = "legacy-recorded";
legacy.refundCompletedAt = now.toISOString();
applyConsumerRefundProviderResult(
  legacy,
  {
    ...stripeInvoiceBinding,
    providerStatus: "succeeded",
    providerReference: "re_legacyverified123",
    paymentIntentReference: "pi_legacyverified123",
    amountPence: 1200,
    attempt: 1,
    note: "The historical record was retrieved and verified directly in Stripe.",
  },
  { operatorReference: "operator-primary", now },
);
assert.equal(legacy.refundProviderStatus, "succeeded");
assert.equal(legacy.refundProviderReference, "re_legacyverified123");

console.log(
  JSON.stringify({
    ok: true,
    authenticatedAccountBinding: true,
    internalBusinessDayTargets: true,
    refundDecisionSeparatedFromCompletion: true,
    refundDecisionRequiredBeforeResolution: true,
    manualCompletionRejected: true,
    invalidProviderEvidenceIsAtomic: true,
    providerPendingTracked: true,
    providerCompletionVerified: true,
    historicalCompletionReconciled: true,
    refundCompletionRequiredBeforeResolution: true,
    closedCaseFrozen: true,
    safeSubmissionConfirmed: true,
  }),
);
