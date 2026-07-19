import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const AUDIT_HASH_VERSION = 1;

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonicalValue(value[key])]),
    );
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function auditKey(masterSecret) {
  if (!masterSecret || String(masterSecret).length < 32)
    throw new Error("A strong master key is required for audit integrity.");
  return createHmac("sha256", String(masterSecret))
    .update("content-protect:audit-integrity:v1")
    .digest();
}

export function auditActorHash(userId, masterSecret, fallback = "system") {
  return createHmac("sha256", auditKey(masterSecret))
    .update(`actor:${userId || fallback}`)
    .digest("hex");
}

export function auditEventHash(event, masterSecret) {
  const payload = {
    version: AUDIT_HASH_VERSION,
    eventUuid: event.eventUuid,
    sequenceNo: Number(event.sequenceNo),
    actorHash: event.actorHash,
    ipHash: event.ipHash || null,
    action: event.action,
    details: event.details || {},
    createdAt: new Date(event.createdAt).toISOString(),
    previousHash: event.previousHash || null,
  };
  return createHmac("sha256", auditKey(masterSecret))
    .update(canonicalJson(payload))
    .digest("hex");
}

export function protectAuditEvent(
  event,
  { masterSecret, sequenceNo, previousHash = null },
) {
  const protectedEvent = {
    eventUuid: event.eventUuid || randomUUID(),
    sequenceNo: Number(sequenceNo),
    actorHash:
      event.actorHash ||
      auditActorHash(
        event.userId,
        masterSecret,
        event.actorSubject ||
          (event.databaseId ? `deleted:${event.databaseId}` : "system"),
      ),
    ipHash: event.ipHash || null,
    action: String(event.action),
    details: event.details || {},
    createdAt: new Date(event.createdAt || event.at).toISOString(),
    previousHash: previousHash || null,
    hashVersion: AUDIT_HASH_VERSION,
  };
  protectedEvent.eventHash = auditEventHash(protectedEvent, masterSecret);
  return protectedEvent;
}

function hashesEqual(left, right) {
  if (
    !/^[a-f0-9]{64}$/i.test(left || "") ||
    !/^[a-f0-9]{64}$/i.test(right || "")
  )
    return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function verifyAuditChain(events, masterSecret) {
  let previous = null;
  for (const event of events) {
    if (Number(event.hashVersion) !== AUDIT_HASH_VERSION)
      throw new Error(
        `Audit event ${event.databaseId || event.eventUuid} is not protected.`,
      );
    if (
      !Number.isSafeInteger(Number(event.sequenceNo)) ||
      Number(event.sequenceNo) < 1
    )
      throw new Error("Audit sequence is invalid.");
    if (previous) {
      if (Number(event.sequenceNo) !== Number(previous.sequenceNo) + 1)
        throw new Error("Audit sequence is not contiguous.");
      if (!hashesEqual(event.previousHash, previous.eventHash))
        throw new Error("Audit chain linkage is invalid.");
    }
    const expected = auditEventHash(event, masterSecret);
    if (!hashesEqual(event.eventHash, expected))
      throw new Error("Audit event integrity verification failed.");
    previous = event;
  }
  return {
    ok: true,
    protectedEvents: events.length,
    firstSequence: events[0] ? Number(events[0].sequenceNo) : null,
    lastSequence: previous ? Number(previous.sequenceNo) : null,
    headHash: previous?.eventHash || null,
  };
}
