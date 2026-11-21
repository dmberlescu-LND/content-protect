import assert from "node:assert/strict";
import {
  pilotActionError,
  pilotAllowsExternalAction,
  pilotConfiguration,
} from "../pilot-policy.mjs";

assert.deepEqual(pilotConfiguration({}), {
  mode: "standard",
  valid: true,
  externalActionsAllowed: true,
});
assert.deepEqual(pilotConfiguration({ CONTENT_PROTECT_PILOT_MODE: "free" }), {
  mode: "free",
  valid: true,
  externalActionsAllowed: false,
});
for (const action of ["scan", "billing", "notice-delivery"])
  assert.equal(
    pilotAllowsExternalAction({ CONTENT_PROTECT_PILOT_MODE: "free" }, action),
    false,
  );
assert.equal(
  pilotAllowsExternalAction({ CONTENT_PROTECT_PILOT_MODE: "free" }, "vault"),
  true,
);
assert.equal(
  pilotAllowsExternalAction({ CONTENT_PROTECT_PILOT_MODE: "unexpected" }, "scan"),
  false,
);
assert.match(
  pilotActionError({ CONTENT_PROTECT_PILOT_MODE: "free" }, "billing"),
  /free controlled pilot/i,
);
assert.match(
  pilotActionError({ CONTENT_PROTECT_PILOT_MODE: "unexpected" }, "scan"),
  /invalid/i,
);

console.log(JSON.stringify({ ok: true, freePilotExternalActionsLocked: true, invalidConfigurationFailsClosed: true }));
