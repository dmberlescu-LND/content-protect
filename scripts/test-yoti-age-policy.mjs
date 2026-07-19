import assert from "node:assert/strict";
import {
  buildYotiAgeSession,
  interpretYotiAgeResult,
  YOTI_SESSION_ID,
} from "../yoti-age-policy.mjs";

const sessionId = "14010f56-3f04-4f1f-84e7-a43ff723ef86";
const sdkId = "5d3add31-3a3a-4d3b-a6b4-347edb35264c";
const userId = "creator_opaque_id";
const configuration = buildYotiAgeSession({
  userId,
  baseUrl: "https://content-protect.com",
});

assert.equal(configuration.type, "OVER");
assert.equal(configuration.digital_id.threshold, 18);
assert.equal(configuration.doc_scan.threshold, 18);
assert.equal(configuration.synchronous_checks, true);
assert.equal(
  configuration.privacy_policy,
  "https://content-protect.com/privacy.html",
);
assert.equal(YOTI_SESSION_ID.test(sessionId), true);
assert.equal(YOTI_SESSION_ID.test("not-a-session----------------------"), false);

const complete = {
  id: sessionId,
  sdk_id: sdkId,
  reference_id: userId,
  type: "OVER",
  status: "COMPLETE",
  method: "DIGITAL_ID",
  age: 18,
};
assert.deepEqual(
  interpretYotiAgeResult(complete, { sessionId, sdkId, userId }),
  {
    accepted: true,
    status: "verified",
    method: "DIGITAL_ID",
    providerStatus: "COMPLETE",
  },
);

for (const unsafe of [
  { reference_id: "another-user" },
  { sdk_id: "another-sdk" },
  { type: "AGE" },
  { status: "FAIL" },
  { method: "UNKNOWN_FUTURE_METHOD" },
  { age: 17 },
  { age: "18" },
]) {
  assert.equal(
    interpretYotiAgeResult(
      { ...complete, ...unsafe },
      { sessionId, sdkId, userId },
    ).accepted,
    false,
  );
}

assert.equal(
  interpretYotiAgeResult(
    { ...complete, status: "IN_PROGRESS" },
    { sessionId, sdkId, userId },
  ).status,
  "pending",
);

console.log(
  JSON.stringify({
    ok: true,
    officialSessionContract: true,
    identityBinding: true,
    approvedMethodsOnly: true,
    failClosedResult: true,
  }),
);
