import assert from "node:assert/strict";

import {
  operatorAccessConfiguration,
  operatorActorSubject,
  operatorTotpValid,
} from "../operator-access-policy.mjs";
import { totpAt } from "../totp.mjs";

const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
  timestamp = Date.parse("2026-07-19T20:30:00.000Z"),
  complete = operatorAccessConfiguration({
    TAKEDOWN_OPERATOR_ID: "director-01",
    TAKEDOWN_OPERATOR_TOKEN: "x".repeat(48),
    TAKEDOWN_OPERATOR_TOTP_SECRET: secret,
  });

assert.equal(complete.configured, true);
assert.equal(complete.id, "director-01");
assert.equal(operatorActorSubject(complete), "operator:director-01");
assert.equal(
  operatorTotpValid(complete, totpAt(secret, timestamp), timestamp),
  true,
);
assert.equal(operatorTotpValid(complete, "000000", timestamp), false);
assert.equal(JSON.stringify(complete).includes("x".repeat(48)), false);
assert.equal(JSON.stringify(complete).includes(secret), false);

for (const incomplete of [
  {
    TAKEDOWN_OPERATOR_ID: "director-01",
    TAKEDOWN_OPERATOR_TOKEN: "x".repeat(48),
  },
  {
    TAKEDOWN_OPERATOR_ID: "bad identity with spaces",
    TAKEDOWN_OPERATOR_TOKEN: "x".repeat(48),
    TAKEDOWN_OPERATOR_TOTP_SECRET: secret,
  },
  {
    TAKEDOWN_OPERATOR_ID: "director-01",
    TAKEDOWN_OPERATOR_TOKEN: "short",
    TAKEDOWN_OPERATOR_TOTP_SECRET: secret,
  },
  {
    TAKEDOWN_OPERATOR_ID: "director-01",
    TAKEDOWN_OPERATOR_TOKEN: "x".repeat(48),
    TAKEDOWN_OPERATOR_TOTP_SECRET: "NOT-A-VALID-SECRET",
  },
]) {
  const configuration = operatorAccessConfiguration(incomplete);
  assert.equal(configuration.configured, false);
  assert.equal(configuration.id, null);
  assert.equal(operatorTotpValid(configuration, "123456", timestamp), false);
}

console.log(
  JSON.stringify({
    ok: true,
    twoFactorsRequired: true,
    actorIdentityBound: true,
    credentialsNotEnumerable: true,
  }),
);
