import assert from "node:assert/strict";
import {
  discoverySourceRegistry,
  discoverySourceSummary,
} from "../discovery-source-registry.mjs";

const blocked = discoverySourceSummary({});
assert.equal(blocked.total, 2);
assert.equal(blocked.enabled, 0);
assert.equal(blocked.blocked, 2);
assert.deepEqual(blocked.sources[0].missingApprovals, [
  "data-protection-and-transfer-review",
  "lawful-adult-content-confirmation",
]);

const stillOnly = discoverySourceRegistry({
  TINEYE_API_KEY: "test-key",
  TINEYE_DATA_PROTECTION_APPROVAL_REFERENCE: "privacy-review-2026-01",
  TINEYE_ADULT_CONTENT_APPROVAL_REFERENCE: "vendor-ticket-2026-01",
});
assert.equal(stillOnly[0].status, "approved");
assert.equal(stillOnly[1].status, "blocked");
assert.deepEqual(stillOnly[1].missingApprovals, [
  "video-frame-vendor-and-privacy-approval",
]);

const allApproved = discoverySourceSummary({
  TINEYE_API_KEY: "test-key",
  TINEYE_DATA_PROTECTION_APPROVAL_REFERENCE: "privacy-review-2026-01",
  TINEYE_ADULT_CONTENT_APPROVAL_REFERENCE: "vendor-ticket-2026-01",
  TINEYE_VIDEO_FRAME_APPROVAL_REFERENCE: "video-privacy-review-2026-01",
});
assert.equal(allApproved.enabled, 2);
assert.equal(allApproved.blocked, 0);

console.log(JSON.stringify({ ok: true, sources: allApproved.total }));
