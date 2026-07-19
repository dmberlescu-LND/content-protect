import assert from "node:assert/strict";
import {
  exactNoticeApproved,
  noticeText,
  textDigest,
} from "../takedown-policy.mjs";

const creator = { name: "Legal Name", stageName: "Creator Name" };
const preparedCase = {
  id: "case-123",
  recipientEmail: "copyright@example-host.test",
  recipientSource: "https://example-host.test/copyright",
  jurisdiction: "England and Wales / host copyright channel",
  legalBasis: "Copyright ownership and host removal policy",
  targetUrl: "https://unauthorised.example/post",
  evidenceHash: "a".repeat(64),
  noticeDraft: {
    rightsReview: {
      rightsHolderName: "Legal Name",
      roleLabel: "Copyright owner",
    },
  },
};
const renderedNotice = noticeText(preparedCase, creator);
const approvedHash = textDigest(renderedNotice);

assert.match(renderedNotice, /Recipient: copyright@example-host\.test/);
assert.match(renderedNotice, /Jurisdiction\/channel reviewed:/);
assert.match(renderedNotice, /Legal basis\/channel:/);
assert.match(renderedNotice, /Claimant: Legal Name/);
assert.match(renderedNotice, /Professional name: Creator Name/);
assert.match(renderedNotice, /Rights holder: Legal Name/);
assert.match(renderedNotice, /Claimant capacity: Copyright owner/);
assert.equal(
  exactNoticeApproved({
    renderedNotice,
    preparedNoticeHash: approvedHash,
    creatorApprovedNoticeHash: approvedHash,
    submittedNoticeHash: approvedHash,
  }),
  true,
);

for (const changed of [
  { recipientEmail: "different@example-host.test" },
  { jurisdiction: "Different jurisdiction" },
  { legalBasis: "Different legal basis" },
  { targetUrl: "https://different.example/post" },
  {
    noticeDraft: {
      rightsReview: {
        rightsHolderName: "Different Rights Holder",
        roleLabel: "Authorised agent for the rights holder",
      },
    },
  },
]) {
  assert.equal(
    exactNoticeApproved({
      renderedNotice: noticeText({ ...preparedCase, ...changed }, creator),
      preparedNoticeHash: approvedHash,
      creatorApprovedNoticeHash: approvedHash,
      submittedNoticeHash: approvedHash,
    }),
    false,
  );
}

console.log(
  JSON.stringify({
    ok: true,
    recipientBoundBeforeApproval: true,
    jurisdictionBoundBeforeApproval: true,
    creatorExactTextHashRequired: true,
    postApprovalMutationRejected: true,
    legalClaimantIdentityIncluded: true,
    rightsCapacityIncluded: true,
  }),
);
