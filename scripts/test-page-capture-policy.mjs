import assert from "node:assert/strict";

import {
  PAGE_CAPTURE_ASSET_STATUS,
  mergeProviderEvidence,
  pageCaptureMetadata,
  pageCaptureSnapshot,
  referenceAssets,
} from "../page-capture-policy.mjs";

const userId = "11111111-1111-4111-8111-111111111111",
  asset = {
    id: "22222222-2222-4222-8222-222222222222",
    userId,
    status: PAGE_CAPTURE_ASSET_STATUS,
    mime: "image/png",
    size: 321,
    checksum: "a".repeat(64),
    width: 800,
    height: 600,
  },
  match = {
    id: "33333333-3333-4333-8333-333333333333",
    userId,
    sourceUrl: "https://copied.example/post",
    site: "copied.example",
    evidence: {},
  },
  capture = pageCaptureMetadata({
    asset,
    match,
    consentVersion: "2026-07-19-v1",
    capturedAt: "2026-07-19T21:00:00.000Z",
  });

match.evidence.pageCapture = capture;
assert.deepEqual(pageCaptureSnapshot(match, [asset], userId), capture);
assert.equal(
  referenceAssets(
    [asset, { ...asset, id: "reference", status: "Protected" }],
    userId,
  ).length,
  1,
);
assert.equal(
  pageCaptureSnapshot(
    { ...match, sourceUrl: "https://copied.example/changed" },
    [asset],
    userId,
  ),
  null,
);
assert.equal(
  pageCaptureSnapshot(match, [{ ...asset, checksum: "b".repeat(64) }], userId),
  null,
);
assert.throws(
  () =>
    pageCaptureMetadata({
      asset,
      match: { ...match, sourceUrl: "http://copied.example/post" },
      consentVersion: "2026-07-19-v1",
    }),
  /invalid/i,
);
assert.deepEqual(
  mergeProviderEvidence(match.evidence, { provider: "refreshed" }),
  { provider: "refreshed", pageCapture: capture },
);

console.log(
  JSON.stringify({
    ok: true,
    encryptedAssetBinding: true,
    sourceUrlBinding: true,
    unsafeSourceRejected: true,
    checksumTamperingRejected: true,
    planReferenceFilesSeparated: true,
    rescansPreserveCapture: true,
  }),
);
