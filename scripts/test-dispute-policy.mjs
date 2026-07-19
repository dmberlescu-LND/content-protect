import assert from "node:assert/strict";

import {
  disputeReceivedEvent,
  disputeReview,
  disputeReviewEvent,
  disputeSummaries,
  openDisputes,
  validateDisputeIntake,
} from "../dispute-policy.mjs";

const caseRecord = {
    id: "11111111-1111-4111-8111-111111111111",
    targetUrl: "https://reported.example/post",
    status: "Delivered — monitoring",
    providerMessageId: "provider-message-1",
    timeline: [],
  },
  valid = {
    caseReference: caseRecord.id,
    reportedUrl: caseRecord.targetUrl,
    email: "Reported.Party@example.test",
    country: "gb",
    category: "licence",
    statement:
      "I hold a current written licence for this use and can provide the public licence record.",
    supportingUrl: "https://reported.example/licence#document",
    confirmAccuracy: true,
    confirmAuthority: true,
    confirmNoSensitiveAttachments: true,
    privacyAccepted: true,
  },
  intake = validateDisputeIntake(valid, caseRecord),
  disputeId = "22222222-2222-4222-8222-222222222222",
  received = disputeReceivedEvent({
    disputeId,
    intake,
    contactHash: "a".repeat(64),
    statementChecksum: "b".repeat(64),
    ciphertext: "encrypted-" + "c".repeat(64),
    previousStatus: caseRecord.status,
    receivedAt: "2026-07-19T22:30:00.000Z",
  });

assert.equal(intake.email, "reported.party@example.test");
assert.equal(intake.country, "GB");
assert.equal(intake.supportingUrl, "https://reported.example/licence");
assert.equal(
  validateDisputeIntake(valid, { ...caseRecord, id: "unknown" }),
  null,
);
assert.equal(
  validateDisputeIntake(valid, {
    ...caseRecord,
    status: "Awaiting operator preparation",
  }),
  null,
);
assert.throws(
  () => validateDisputeIntake({ ...valid, reportedUrl: "http://bad.test" }),
  /HTTPS/i,
);
assert.throws(
  () => validateDisputeIntake({ ...valid, confirmAuthority: false }),
  /confirmations/i,
);
caseRecord.timeline.push(received);
assert.equal(openDisputes(caseRecord).length, 1);
assert.deepEqual(disputeSummaries(caseRecord)[0], {
  disputeId,
  version: "2026-07-19-v1",
  category: "licence",
  country: "GB",
  statementChecksum: "b".repeat(64),
  receivedAt: "2026-07-19T22:30:00.000Z",
  status: "open",
});
assert.throws(
  () =>
    disputeReview(
      {
        action: "continue",
        reviewNote:
          "Evidence checked and the requested continuation was evaluated.",
        confirmCreatorNotified: true,
      },
      openDisputes(caseRecord)[0],
    ),
  /counsel/i,
);
assert.throws(
  () =>
    disputeReview(
      {
        action: "accept",
        reviewNote: "The licence evidence is sufficient to close this case.",
        confirmCaseClosure: true,
      },
      openDisputes(caseRecord)[0],
    ),
  /creator/i,
);
const accepted = disputeReview(
  {
    action: "accept",
    reviewNote: "The licence evidence is sufficient to close this case.",
    confirmCaseClosure: true,
    confirmCreatorNotified: true,
  },
  openDisputes(caseRecord)[0],
);
caseRecord.timeline.push(
  disputeReviewEvent({
    disputeId,
    review: accepted,
    operatorReference: "operator-01",
    reviewedAt: "2026-07-19T22:45:00.000Z",
  }),
);
assert.equal(openDisputes(caseRecord).length, 0);
assert.equal(disputeSummaries(caseRecord)[0].status, "resolved");

console.log(
  JSON.stringify({
    ok: true,
    deliveredCaseBinding: true,
    exactHttpsTargetRequired: true,
    authorityAndPrivacyConfirmationsRequired: true,
    encryptedEventShapeValidated: true,
    openDisputeTracked: true,
    creatorNotificationRequired: true,
    counselRequiredToContinue: true,
    resolutionTracked: true,
  }),
);
