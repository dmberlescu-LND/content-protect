import assert from "node:assert/strict";
import { unsafeRequestOriginAllowed } from "../security-policy.mjs";

const base = {
  method: "POST",
  route: "/api/account/password",
  origin: "https://content-protect.com",
  appOrigin: "https://content-protect.com",
  production: true,
};

assert.equal(unsafeRequestOriginAllowed(base), true);
assert.equal(unsafeRequestOriginAllowed({ ...base, method: "GET" }), true);
assert.equal(unsafeRequestOriginAllowed({ ...base, origin: undefined }), false);
assert.equal(
  unsafeRequestOriginAllowed({ ...base, origin: "https://attacker.example" }),
  false,
);
assert.equal(
  unsafeRequestOriginAllowed({
    ...base,
    origin: "https://subdomain.content-protect.com",
  }),
  false,
);
assert.equal(
  unsafeRequestOriginAllowed({
    ...base,
    route: "/api/billing/webhook",
    origin: undefined,
  }),
  true,
);
assert.equal(
  unsafeRequestOriginAllowed({
    ...base,
    route: "/api/operations/monitor-heartbeat",
    origin: undefined,
  }),
  true,
);
assert.equal(
  unsafeRequestOriginAllowed({
    ...base,
    route: "/api/takedowns/webhook",
    origin: undefined,
  }),
  true,
);
assert.equal(
  unsafeRequestOriginAllowed({
    ...base,
    production: false,
    origin: "http://127.0.0.1:5173",
  }),
  true,
);

console.log(
  JSON.stringify({
    ok: true,
    missingOriginRejected: true,
    crossOriginRejected: true,
    signedWebhookExceptions: true,
    localDevelopmentSupported: true,
  }),
);
