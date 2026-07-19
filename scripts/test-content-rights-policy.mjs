import assert from "node:assert/strict";

import {
  contentRightsDeclaration,
  ContentRightsError,
  contentRightsRecordForAsset,
  contentRightsReview,
  contentRightsSnapshot,
} from "../content-rights-policy.mjs";

const declaration = contentRightsDeclaration(
  {
    rightsRole: "authorised-agent",
    rightsHolderName: "  Example Rights Holder Ltd  ",
    workTitle: "  Creator set 01 ",
    originalPublicationUrl: "https://creator.example/original#private",
    authorityEvidenceReference: " Agency agreement CP-2026-004 ",
    confirmRightsAuthority: true,
    confirmRightsAccurate: true,
  },
  { version: "2026-07-19-v1", declaredAt: "2026-07-19T20:00:00Z" },
);
assert.equal(declaration.rightsHolderName, "Example Rights Holder Ltd");
assert.equal(
  declaration.originalPublicationUrl,
  "https://creator.example/original",
);
assert.equal(declaration.declaredAuthority, true);
assert.throws(
  () =>
    contentRightsDeclaration(
      {
        rightsRole: "copyright-owner",
        rightsHolderName: "Creator",
        authorityEvidenceReference: "source-file",
        confirmRightsAuthority: true,
        confirmRightsAccurate: false,
      },
      { version: "2026-07-19-v1" },
    ),
  ContentRightsError,
);
assert.throws(
  () =>
    contentRightsDeclaration(
      {
        rightsRole: "copyright-owner",
        rightsHolderName: "Creator",
        originalPublicationUrl: "http://insecure.example/post",
        authorityEvidenceReference: "source-file",
        confirmRightsAuthority: true,
        confirmRightsAccurate: true,
      },
      { version: "2026-07-19-v1" },
    ),
  /valid HTTPS/,
);

const records = [
    {
      id: "record-old",
      userId: "user-1",
      kind: "content_rights",
      provider: "creator-attestation",
      providerReference: "asset-1",
      status: "pending",
      evidence: declaration,
      createdAt: "2026-07-19T20:00:00Z",
      updatedAt: "2026-07-19T20:00:00Z",
    },
    {
      id: "record-new",
      userId: "user-1",
      kind: "content_rights",
      provider: "creator-attestation",
      providerReference: "asset-1",
      status: "verified",
      evidence: declaration,
      createdAt: "2026-07-19T21:00:00Z",
      updatedAt: "2026-07-19T21:00:00Z",
    },
  ],
  record = contentRightsRecordForAsset(records, "user-1", "asset-1"),
  snapshot = contentRightsSnapshot(record),
  review = contentRightsReview(snapshot, {
    confirmed: true,
    reviewReference: "restricted-case-file-42",
    operatorId: "director-danut-berlescu",
    reviewedAt: "2026-07-19T21:10:00Z",
  });
assert.equal(record.id, "record-new");
assert.equal(snapshot.role, "authorised-agent");
assert.equal(review.declarationRecordId, "record-new");
assert.equal(review.reviewReference, "restricted-case-file-42");
assert.throws(
  () =>
    contentRightsReview(snapshot, {
      confirmed: false,
      reviewReference: "restricted-case-file-42",
      operatorId: "operator-1",
    }),
  ContentRightsError,
);

console.log(
  JSON.stringify({
    ok: true,
    perAssetDeclaration: true,
    safeReferenceUrl: true,
    authorityAndAccuracyRequired: true,
    operatorReviewRequired: true,
    newestRecordSelected: true,
  }),
);
