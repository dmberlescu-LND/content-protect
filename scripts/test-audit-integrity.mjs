import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  auditActorHash,
  canonicalJson,
  protectAuditEvent,
  verifyAuditChain,
} from "../audit-integrity.mjs";

const masterSecret = "audit-test-master-key-that-is-longer-than-32-characters";

assert.equal(
  canonicalJson({ z: 1, a: { y: 2, x: 3 }, list: [{ b: 2, a: 1 }] }),
  '{"a":{"x":3,"y":2},"list":[{"a":1,"b":2}],"z":1}',
);

const first = protectAuditEvent(
  {
    eventUuid: "11111111-1111-4111-8111-111111111111",
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    action: "account.login",
    details: { method: "password", nested: { b: 2, a: 1 } },
    ipHash: "a".repeat(64),
    at: "2026-07-19T12:00:00.000Z",
  },
  { masterSecret, sequenceNo: 1 },
);
const second = protectAuditEvent(
  {
    eventUuid: "22222222-2222-4222-8222-222222222222",
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    action: "profile.updated",
    details: { fields: ["stageName"] },
    at: "2026-07-19T12:01:00.000Z",
  },
  { masterSecret, sequenceNo: 2, previousHash: first.eventHash },
);

assert.equal(first.actorHash, second.actorHash);
assert.equal(
  first.actorHash,
  auditActorHash("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", masterSecret),
);
assert.deepEqual(verifyAuditChain([first, second], masterSecret), {
  ok: true,
  protectedEvents: 2,
  firstSequence: 1,
  lastSequence: 2,
  headHash: second.eventHash,
});
assert.equal(
  verifyAuditChain([{ ...first, userId: null }], masterSecret).ok,
  true,
);

const retainedSuffix = verifyAuditChain([second], masterSecret);
assert.equal(retainedSuffix.firstSequence, 2);

assert.throws(
  () =>
    verifyAuditChain(
      [first, { ...second, details: { fields: ["email"] } }],
      masterSecret,
    ),
  /integrity verification failed/,
);
assert.throws(
  () => verifyAuditChain([{ ...first, ipHash: "b".repeat(64) }], masterSecret),
  /integrity verification failed/,
);

const migration = await readFile(
    new URL("../db/migrations/017_audit_integrity.sql", import.meta.url),
    "utf8",
  ),
  databaseSource = await readFile(
    new URL("../database.mjs", import.meta.url),
    "utf8",
  );
assert.match(migration, /CREATE TRIGGER audit_events_append_only/);
assert.match(migration, /audit events are append-only/);
assert.match(migration, /OLD\.user_id IS NOT NULL AND NEW\.user_id IS NULL/);
assert.match(
  databaseSource,
  /SET LOCAL content_protect\.audit_retention = 'on'/,
);
assert.match(databaseSource, /verifyAuditChain\(rows\.map\(auditRecord\)/);
assert.throws(
  () =>
    verifyAuditChain(
      [first, { ...second, previousHash: "0".repeat(64) }],
      masterSecret,
    ),
  /linkage is invalid/,
);
assert.throws(
  () => verifyAuditChain([first, { ...second, sequenceNo: 3 }], masterSecret),
  /sequence is not contiguous/,
);

console.log(
  JSON.stringify({
    ok: true,
    canonicalPayloads: true,
    hmacChain: true,
    tamperDetection: true,
    retainedPrefixSupport: true,
    appendOnlyDatabasePolicy: true,
    accountErasureCompatibility: true,
  }),
);
