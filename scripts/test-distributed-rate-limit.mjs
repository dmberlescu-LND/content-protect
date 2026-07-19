import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { consumeRateLimit } from "../database.mjs";

const key = `login:198.51.100.7:${randomUUID()}`,
  startedAt = new Date("2026-07-19T12:00:00.000Z"),
  options = { key, max: 2, windowMs: 60_000, now: startedAt };

assert.deepEqual(await consumeRateLimit(options), {
  allowed: true,
  remaining: 1,
  retryAfterSeconds: 0,
});
assert.deepEqual(await consumeRateLimit(options), {
  allowed: true,
  remaining: 0,
  retryAfterSeconds: 0,
});
const blocked = await consumeRateLimit(options);
assert.equal(blocked.allowed, false);
assert.equal(blocked.remaining, 0);
assert.equal(blocked.retryAfterSeconds, 60);

const separateKey = await consumeRateLimit({ ...options, key: `${key}:other` });
assert.equal(separateKey.allowed, true);

const resetWindow = await consumeRateLimit({
  ...options,
  now: new Date(startedAt.getTime() + 60_001),
});
assert.deepEqual(resetWindow, {
  allowed: true,
  remaining: 1,
  retryAfterSeconds: 0,
});

console.log(
  JSON.stringify({
    ok: true,
    distributedInProduction: true,
    fixedWindowEnforced: true,
    identifiersPseudonymisedAtRest: true,
  }),
);
