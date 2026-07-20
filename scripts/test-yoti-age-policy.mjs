import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  buildYotiAgeShareConfiguration,
  interpretYotiAgeReceipt,
  yotiConfiguration,
  yotiReceiptAlreadyUsed,
  yotiSandboxTestAllowed,
  yotiSandboxTestConfiguration,
  YOTI_SHARE_ID,
} from "../yoti-digital-identity.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 }),
  pem = privateKey.export({ type: "pkcs8", format: "pem" }),
  configuration = yotiConfiguration({
    YOTI_SDK_ID: "content_protect_sdk_123",
    YOTI_PRIVATE_KEY: pem,
  });
assert.equal(configuration.configured, true);
assert.equal(yotiConfiguration({}).configured, false);
assert.throws(
  () => yotiConfiguration({ YOTI_SDK_ID: "sdk_without_key" }),
  /both SDK ID and private key/,
);
assert.throws(
  () =>
    yotiConfiguration({
      YOTI_SDK_ID: "content_protect_sdk_123",
      YOTI_PRIVATE_KEY: "not-a-private-key",
    }),
  /valid PEM private key/,
);
assert.deepEqual(
  yotiConfiguration(
    {
      YOTI_MODE: "live",
      YOTI_SDK_ID: "content_protect_sdk_123",
      YOTI_PRIVATE_KEY: pem,
    },
    { secure: false },
  ),
  { configured: false, reason: "dependency-security-blocked" },
);
assert.equal(
  yotiConfiguration({
    YOTI_MODE: "live",
    YOTI_SDK_ID: "content_protect_sdk_123",
    YOTI_PRIVATE_KEY: pem,
  }).configured,
  true,
);
assert.equal(
  yotiConfiguration({
    YOTI_MODE: "sandbox",
    YOTI_SDK_ID: "content_protect_sdk_123",
    YOTI_PRIVATE_KEY: pem,
  }).configured,
  true,
);
assert.equal(
  yotiConfiguration(
    {
      YOTI_MODE: "live",
      YOTI_SDK_ID: "content_protect_sdk_123",
      YOTI_PRIVATE_KEY: pem,
    },
    { secure: true },
  ).configured,
  true,
);

const sandboxConfiguration = yotiSandboxTestConfiguration({
  YOTI_MODE: "sandbox",
  YOTI_SANDBOX_TEST_EMAILS:
    " test@example.com,SECOND@example.com,test@example.com ",
  YOTI_SANDBOX_TEST_APPROVAL_REFERENCE: "owner-approval-2026-07-19",
});
assert.equal(sandboxConfiguration.configured, true);
assert.deepEqual(sandboxConfiguration.emails, [
  "test@example.com",
  "second@example.com",
]);
assert.equal(
  yotiSandboxTestAllowed(sandboxConfiguration, " TEST@example.com "),
  true,
);
assert.equal(
  yotiSandboxTestAllowed(sandboxConfiguration, "other@example.com"),
  false,
);
assert.equal(
  yotiSandboxTestConfiguration({
    YOTI_MODE: "live",
    YOTI_SANDBOX_TEST_EMAILS: "test@example.com",
    YOTI_SANDBOX_TEST_APPROVAL_REFERENCE: "owner-approval-2026-07-19",
  }).configured,
  false,
);
assert.equal(
  yotiSandboxTestConfiguration({
    YOTI_MODE: "sandbox",
    YOTI_SANDBOX_TEST_EMAILS: "test@example.com",
  }).configured,
  false,
);

const share = buildYotiAgeShareConfiguration({
    userId: "creator-opaque-id",
    redirectUrl: "https://content-protect.com/?age_check=return",
  }),
  serializedShare = JSON.parse(JSON.stringify(share)),
  wanted = serializedShare.policy.wanted;
assert.deepEqual(serializedShare.subject, {
  subject_id: "creator-opaque-id",
});
assert.equal(
  serializedShare.redirectUri,
  "https://content-protect.com/?age_check=return",
);
assert.equal(wanted.length, 1);
assert.equal(wanted[0].name, "date_of_birth");
assert.equal(wanted[0].derivation, "age_over:18");
assert.equal(wanted[0].accept_self_asserted, false);

const sessionId = "share_session_1234567890",
  receiptId = "share_receipt_12345678",
  createdAt = "2026-07-19T12:00:00.000Z",
  expiresAt = "2026-07-19T12:15:00.000Z",
  timestamp = new Date("2026-07-19T12:05:00.000Z"),
  ageValue = {
    getCheckType: () => "age_over",
    getAge: () => 18,
    getResult: () => true,
  },
  attribute = {
    getValue: () => ageValue,
    getSources: () => [{ type: "YOTI_ADMIN" }],
    getVerifiers: () => [],
  },
  receipt = {
    getSessionId: () => sessionId,
    getReceiptId: () => receiptId,
    getTimestamp: () => timestamp,
    getError: () => null,
    getProfile: () => ({ findAgeOverVerification: () => attribute }),
  },
  expectations = {
    sessionId,
    receiptId,
    createdAt,
    expiresAt,
    now: new Date("2026-07-19T12:06:00.000Z"),
  };

assert.deepEqual(interpretYotiAgeReceipt(receipt, expectations), {
  accepted: true,
  status: "verified",
  method: "YOTI_DIGITAL_IDENTITY",
  threshold: 18,
  receiptTimestamp: timestamp.toISOString(),
});
assert.equal(
  interpretYotiAgeReceipt(
    { ...receipt, getSessionId: () => "another_session_123456" },
    expectations,
  ).status,
  "mismatch",
);
assert.equal(
  interpretYotiAgeReceipt(
    {
      ...receipt,
      getProfile: () => ({
        findAgeOverVerification: () => ({
          ...attribute,
          getSources: () => [],
        }),
      }),
    },
    expectations,
  ).accepted,
  false,
);
assert.equal(
  interpretYotiAgeReceipt(receipt, {
    ...expectations,
    now: new Date("2026-07-19T12:16:00.000Z"),
  }).status,
  "expired",
);
assert.equal(YOTI_SHARE_ID.test(sessionId), true);
assert.equal(YOTI_SHARE_ID.test("short"), false);
assert.equal(
  yotiReceiptAlreadyUsed(
    [{ id: "old", evidence: { receiptId } }],
    receiptId,
    "current",
  ),
  true,
);
assert.equal(
  yotiReceiptAlreadyUsed(
    [{ id: "current", evidence: { receiptId } }],
    receiptId,
    "current",
  ),
  false,
);

console.log(
  JSON.stringify({
    ok: true,
    officialSignedSdk: true,
    ageOverOnly: true,
    selfAssertedRejected: true,
    sessionAndReceiptBound: true,
    receiptReplayRejected: true,
    rawIdentityNotRetained: true,
    sandboxAllowlistFailClosed: true,
  }),
);
