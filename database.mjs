import { createHmac, randomUUID } from "node:crypto";
import pg from "pg";
import { protectAuditEvent, verifyAuditChain } from "./audit-integrity.mjs";
import { drainObjectDeletionQueue } from "./retention-queue.mjs";

const { Pool } = pg;
const localRateLimits = new Map();
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
  : null;
const iso = (value) => (value ? new Date(value).toISOString() : null);

export const databaseMode = () => (pool ? "postgresql" : "local-json");

function auditMasterSecret() {
  const secret = process.env.CONTENT_PROTECT_MASTER_KEY;
  if (!secret)
    throw new Error(
      "CONTENT_PROTECT_MASTER_KEY is required for PostgreSQL audit integrity.",
    );
  return secret;
}

function auditRecord(row) {
  return {
    databaseId: row.id,
    eventUuid: row.event_uuid,
    sequenceNo: Number(row.sequence_no),
    actorHash: row.actor_hash,
    ipHash: row.ip_hash,
    action: row.action,
    details: row.details || {},
    createdAt: iso(row.created_at),
    previousHash: row.previous_hash,
    eventHash: row.event_hash,
    hashVersion: Number(row.hash_version),
  };
}

async function auditRows(client) {
  const result = await client.query(
    `SELECT id,user_id,action,details,ip_hash,created_at,event_uuid,sequence_no,
       actor_hash,previous_hash,event_hash,hash_version
     FROM audit_events ORDER BY id`,
  );
  return result.rows;
}

export async function initializeAuditIntegrity() {
  if (!pool) return { ok: true, mode: "local-json", protectedEvents: 0 };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(824671)");
    let rows = await auditRows(client);
    const legacy = rows.filter((row) => row.hash_version === null),
      protectedCount = rows.length - legacy.length;
    if (legacy.length && protectedCount)
      throw new Error("Audit integrity migration is only partially applied.");
    if (legacy.length) {
      let previousHash = null,
        sequenceNo = 0;
      for (const row of rows) {
        const event = protectAuditEvent(
          {
            databaseId: row.id,
            userId: row.user_id,
            action: row.action,
            details: row.details || {},
            ipHash: row.ip_hash,
            createdAt: row.created_at,
          },
          {
            masterSecret: auditMasterSecret(),
            sequenceNo: ++sequenceNo,
            previousHash,
          },
        );
        await client.query(
          `UPDATE audit_events SET event_uuid=$2,sequence_no=$3,actor_hash=$4,
             previous_hash=$5,event_hash=$6,hash_version=$7
           WHERE id=$1 AND hash_version IS NULL`,
          [
            row.id,
            event.eventUuid,
            event.sequenceNo,
            event.actorHash,
            event.previousHash,
            event.eventHash,
            event.hashVersion,
          ],
        );
        previousHash = event.eventHash;
      }
      rows = await auditRows(client);
    }
    const verified = verifyAuditChain(
      rows.map(auditRecord),
      auditMasterSecret(),
    );
    await client.query("COMMIT");
    return { ...verified, mode: "hmac-sha256-chain-v1" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function auditIntegrityProbe() {
  if (!pool) return { ok: true, mode: "local-json", protectedEvents: 0 };
  const rows = await auditRows(pool);
  const verified = verifyAuditChain(rows.map(auditRecord), auditMasterSecret());
  return { ...verified, mode: "hmac-sha256-chain-v1" };
}

export async function databaseProbe() {
  if (!pool) return { ok: true, mode: "local-json" };
  const startedAt = Date.now();
  const result = await pool.query(
    "SELECT name,applied_at FROM schema_migrations ORDER BY name DESC LIMIT 1",
  );
  if (!result.rows[0]) throw new Error("No database migrations are recorded.");
  const auditIntegrity = await auditIntegrityProbe();
  return {
    ok: true,
    mode: "postgresql",
    latencyMs: Date.now() - startedAt,
    latestMigration: result.rows[0].name,
    migratedAt: iso(result.rows[0].applied_at),
    auditIntegrity: { ok: auditIntegrity.ok, mode: auditIntegrity.mode },
  };
}

export async function closeDatabase() {
  if (pool) await pool.end();
}

const OPERATIONAL_EVIDENCE_TYPES = new Set([
  "monitoring",
  "retention",
  "backup_restore",
]);

export async function recordOperationalEvidence({
  type,
  status = "succeeded",
  source,
  release = null,
  details = {},
  occurredAt = new Date(),
}) {
  if (!pool)
    throw new Error("PostgreSQL is required for operational evidence.");
  if (!OPERATIONAL_EVIDENCE_TYPES.has(type))
    throw new Error("Unsupported operational evidence type.");
  if (!new Set(["succeeded", "failed"]).has(status))
    throw new Error("Unsupported operational evidence status.");
  if (!/^[a-z0-9._-]{2,80}$/i.test(String(source || "")))
    throw new Error("Operational evidence source is invalid.");
  const timestamp = new Date(occurredAt);
  if (
    !Number.isFinite(timestamp.getTime()) ||
    timestamp > new Date(Date.now() + 5 * 60_000)
  )
    throw new Error("Operational evidence timestamp is invalid.");
  await pool.query(
    `INSERT INTO operational_evidence
       (evidence_type,status,source,release,details,occurred_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
    [
      type,
      status,
      source,
      String(release || "").slice(0, 80) || null,
      JSON.stringify(details || {}),
      timestamp,
    ],
  );
  return { type, status, occurredAt: timestamp.toISOString() };
}

export async function latestOperationalEvidence() {
  if (!pool) return {};
  const result = await pool.query(
    `SELECT DISTINCT ON (evidence_type)
       evidence_type,status,source,release,
       details->>'requiredMigration' AS required_migration,
       occurred_at
     FROM operational_evidence
     ORDER BY evidence_type,occurred_at DESC,id DESC`,
  );
  return Object.fromEntries(
    result.rows.map((row) => [
      row.evidence_type,
      {
        status: row.status,
        source: row.source,
        release: row.release,
        requiredMigration: row.required_migration || null,
        occurredAt: iso(row.occurred_at),
      },
    ]),
  );
}

export async function markObjectDeletionComplete(
  objectKey,
  completedAt = new Date(),
) {
  if (!pool) return false;
  const key = String(objectKey || "");
  if (key.length < 3 || key.length > 500)
    throw new Error("Object deletion key is invalid.");
  const result = await pool.query(
    `UPDATE object_deletion_queue SET
       deleted_at=$2,last_error=NULL,lease_owner=NULL,lease_until=NULL
     WHERE object_key=$1`,
    [key, completedAt],
  );
  if (result.rowCount !== 1)
    throw new Error("The durable object-deletion record is missing.");
  return true;
}

export async function consumeRateLimit({
  key,
  max,
  windowMs,
  now = new Date(),
}) {
  const hashKey =
      process.env.CONTENT_PROTECT_MASTER_KEY || "local-development-only",
    keyHash = createHmac("sha256", hashKey)
      .update(`rate-limit:${String(key)}`)
      .digest("hex"),
    timestamp = new Date(now),
    windowStart = new Date(timestamp.getTime() - windowMs),
    expiresAt = new Date(timestamp.getTime() + windowMs);
  if (!pool) {
    const previous = localRateLimits.get(keyHash),
      count =
        previous && previous.windowStartedAt > windowStart
          ? Math.min(previous.count + 1, max + 1)
          : 1,
      startedAt =
        previous && previous.windowStartedAt > windowStart
          ? previous.windowStartedAt
          : timestamp;
    localRateLimits.set(keyHash, {
      count,
      windowStartedAt: startedAt,
      expiresAt: new Date(startedAt.getTime() + windowMs),
    });
    if (localRateLimits.size > 10_000)
      for (const [candidate, record] of localRateLimits)
        if (record.expiresAt <= timestamp) localRateLimits.delete(candidate);
    return {
      allowed: count <= max,
      remaining: Math.max(0, max - count),
      retryAfterSeconds:
        count <= max
          ? 0
          : Math.max(
              1,
              Math.ceil(
                (startedAt.getTime() + windowMs - timestamp.getTime()) / 1000,
              ),
            ),
    };
  }
  const result = await pool.query(
    `INSERT INTO rate_limits (key_hash,window_started_at,request_count,expires_at)
     VALUES ($1,$2,1,$3)
     ON CONFLICT (key_hash) DO UPDATE SET
       window_started_at=CASE WHEN rate_limits.window_started_at <= $4 THEN EXCLUDED.window_started_at ELSE rate_limits.window_started_at END,
       request_count=CASE WHEN rate_limits.window_started_at <= $4 THEN 1 ELSE LEAST(rate_limits.request_count + 1,$5 + 1) END,
       expires_at=CASE WHEN rate_limits.window_started_at <= $4 THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END
     RETURNING request_count,window_started_at`,
    [keyHash, timestamp, expiresAt, windowStart, max],
  );
  const count = Number(result.rows[0].request_count),
    startedAt = new Date(result.rows[0].window_started_at);
  return {
    allowed: count <= max,
    remaining: Math.max(0, max - count),
    retryAfterSeconds:
      count <= max
        ? 0
        : Math.max(
            1,
            Math.ceil(
              (startedAt.getTime() + windowMs - timestamp.getTime()) / 1000,
            ),
          ),
  };
}

export async function archiveAccountingRecords(userId, now = new Date()) {
  if (!pool) return false;
  const retainedUntil = new Date(now.getTime() + 6 * 365.25 * 86400000);
  await pool.query(
    `INSERT INTO accounting_records
       (source_type,source_id,former_user_hash,record,created_at,retained_until)
     SELECT 'subscription',s.id,encode(digest(s.user_id::text,'sha256'),'hex'),
       jsonb_build_object(
         'plan',s.plan,'status',s.status,'stripeCustomerId',s.stripe_customer_id,
         'stripeSubscriptionId',s.stripe_subscription_id,'currentPeriodEnd',s.current_period_end
       ),$2,$3
     FROM subscriptions s WHERE s.user_id=$1
     ON CONFLICT (source_type,source_id) DO NOTHING`,
    [userId, now, retainedUntil],
  );
  await pool.query(
    `INSERT INTO accounting_records
       (source_type,source_id,former_user_hash,record,created_at,retained_until)
     SELECT 'billing_consent',b.id,encode(digest(b.user_id::text,'sha256'),'hex'),
       jsonb_build_object(
         'plan',b.plan,'termsVersion',b.terms_version,
         'immediateServiceRequested',b.immediate_service_requested,
         'coolingOffAcknowledged',b.cooling_off_acknowledged,
         'stripeCheckoutSessionId',b.stripe_checkout_session_id,'consentedAt',b.created_at
       ),$2,$3
     FROM billing_consents b WHERE b.user_id=$1
     ON CONFLICT (source_type,source_id) DO NOTHING`,
    [userId, now, retainedUntil],
  );
  return true;
}

const RETENTION_OBJECT_CANDIDATES_SQL = `
  SELECT DISTINCT a.object_key,
    CASE
      WHEN a.deleted_at IS NOT NULL THEN 'asset-deleted'
      WHEN a.retention_until IS NOT NULL AND a.retention_until < $1
        THEN 'asset-retention-expired'
      ELSE 'unverified-account-expired'
    END AS reason
  FROM assets a
  JOIN users u ON u.id=a.user_id
  WHERE (
      a.deleted_at IS NOT NULL
      OR (a.retention_until IS NOT NULL AND a.retention_until < $1)
      OR (
        u.email_verified_at IS NULL
        AND u.created_at < $2
        AND NOT EXISTS (
          SELECT 1 FROM billing_consents b WHERE b.user_id=u.id
        )
      )
      OR (
        a.status = 'Evidence capture'
        AND a.created_at < $1
        AND NOT EXISTS (
          SELECT 1 FROM matches m
          WHERE m.evidence->'pageCapture'->>'assetId'=a.id::text
        )
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM matches m
      JOIN takedown_cases c ON c.match_id=m.id
      WHERE (
        m.asset_id=a.id
        OR m.evidence->'pageCapture'->>'assetId'=a.id::text
      ) AND c.legal_hold=true
    )`;

const retentionEvidenceIdentity = () => ({
  source: process.env.RENDER_SERVICE_NAME || "retention-command",
  release: process.env.RENDER_GIT_COMMIT?.slice(0, 80) || null,
});

async function recordRetentionFailure({ phase, error, counts = {} }) {
  const code = String(error?.code || error?.name || "RETENTION_FAILED").slice(
    0,
    80,
  );
  try {
    await recordOperationalEvidence({
      type: "retention",
      status: "failed",
      ...retentionEvidenceIdentity(),
      details: {
        phase,
        code,
        counts,
        objectDeletion: error?.stats || undefined,
      },
    });
  } catch {
    // Preserve the original retention failure for the scheduler and alert route.
  }
}

async function drainRetentionObjectQueue({ deleteObject, startedAt }) {
  const owner = `retention-${randomUUID()}`;
  return drainObjectDeletionQueue({
    claimBatch: async (limit) => {
      const result = await pool.query(
        `WITH candidates AS (
           SELECT id FROM object_deletion_queue
           WHERE deleted_at IS NULL
             AND (lease_until IS NULL OR lease_until < $1)
             AND (last_attempt_at IS NULL OR last_attempt_at < $2)
           ORDER BY queued_at,id
           FOR UPDATE SKIP LOCKED
           LIMIT $3
         )
         UPDATE object_deletion_queue q SET
           deletion_attempts=q.deletion_attempts + 1,
           last_attempt_at=$1,
           lease_owner=$4,
           lease_until=$1 + interval '15 minutes'
         FROM candidates c
         WHERE q.id=c.id
         RETURNING q.id,q.object_key`,
        [new Date(), startedAt, limit, owner],
      );
      return result.rows.map((row) => ({
        id: row.id,
        objectKey: row.object_key,
      }));
    },
    deleteObject,
    markDeleted: async (id) => {
      const result = await pool.query(
        `UPDATE object_deletion_queue SET
           deleted_at=now(),last_error=NULL,lease_owner=NULL,lease_until=NULL
         WHERE id=$1 AND lease_owner=$2`,
        [id, owner],
      );
      if (result.rowCount !== 1)
        throw new Error("Retention deletion lease was lost.");
    },
    markFailed: async (id, error) => {
      await pool.query(
        `UPDATE object_deletion_queue SET
           last_error=$3,lease_owner=NULL,lease_until=NULL
         WHERE id=$1 AND lease_owner=$2`,
        [
          id,
          owner,
          String(error?.message || "Object deletion failed").slice(0, 500),
        ],
      );
    },
    pendingCount: async () => {
      const result = await pool.query(
        "SELECT count(*)::int AS count FROM object_deletion_queue WHERE deleted_at IS NULL",
      );
      return result.rows[0].count;
    },
  });
}

export async function runRetention({
  execute = false,
  now = new Date(),
  deleteObject,
} = {}) {
  if (!pool) return { ok: true, mode: "local-json", execute, counts: {} };
  if (execute && typeof deleteObject !== "function")
    throw new Error(
      "An object-storage deletion function is required for retention execution.",
    );
  const startedAt = new Date(),
    evaluatedAt = new Date(now),
    client = await pool.connect(),
    cutoffs = {
      unverified: new Date(evaluatedAt.getTime() - 30 * 86400000),
      verification: new Date(evaluatedAt.getTime() - 90 * 86400000),
      operational: new Date(evaluatedAt.getTime() - 365 * 86400000),
      legal: new Date(evaluatedAt.getTime() - 6 * 365.25 * 86400000),
    },
    rules = [
      ["expiredSessions", "sessions", "expires_at < $1", evaluatedAt],
      [
        "expiredOperatorSessions",
        "operator_sessions",
        "expires_at < $1",
        evaluatedAt,
      ],
      [
        "expiredTokens",
        "one_time_tokens",
        "expires_at < $1 OR used_at IS NOT NULL",
        evaluatedAt,
      ],
      [
        "failedVerifications",
        "verification_records",
        "status IN ('failed','expired') AND updated_at < $1",
        cutoffs.verification,
      ],
      [
        "expiredAssets",
        "assets",
        "(deleted_at IS NOT NULL OR retention_until < $1) AND NOT EXISTS (SELECT 1 FROM matches m JOIN takedown_cases c ON c.match_id=m.id WHERE (m.asset_id=assets.id OR m.evidence->'pageCapture'->>'assetId'=assets.id::text) AND c.legal_hold=true)",
        evaluatedAt,
      ],
      [
        "orphanEvidenceCaptures",
        "assets",
        "status='Evidence capture' AND created_at < $1 AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.evidence->'pageCapture'->>'assetId'=assets.id::text)",
        evaluatedAt,
      ],
      [
        "oldAuditEvents",
        "audit_events",
        "created_at < $1",
        cutoffs.operational,
      ],
      [
        "oldWebhookReceipts",
        "processed_webhooks",
        "processed_at < $1",
        cutoffs.operational,
      ],
      [
        "oldOperationalEvidence",
        "operational_evidence",
        "occurred_at < $1",
        cutoffs.operational,
      ],
      [
        "closedCases",
        "takedown_cases",
        "closed_at < $1 AND legal_hold = false",
        cutoffs.legal,
      ],
      [
        "orphanMatches",
        "matches",
        "discovered_at < $1 AND NOT EXISTS (SELECT 1 FROM takedown_cases c WHERE c.match_id = matches.id)",
        cutoffs.operational,
      ],
      [
        "orphanScans",
        "scans",
        "COALESCE(completed_at, started_at) < $1 AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.scan_id = scans.id)",
        cutoffs.operational,
      ],
      [
        "unverifiedAccounts",
        "users",
        "email_verified_at IS NULL AND created_at < $1 AND NOT EXISTS (SELECT 1 FROM billing_consents b WHERE b.user_id = users.id)",
        cutoffs.unverified,
      ],
      [
        "expiredAccountingRecords",
        "accounting_records",
        "retained_until < $1",
        evaluatedAt,
      ],
      ["expiredRateLimits", "rate_limits", "expires_at < $1", evaluatedAt],
    ];
  let counts = {};
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL content_protect.audit_retention = 'on'");
    await client.query("SELECT pg_advisory_xact_lock(824672)");
    const candidates = await client.query(
      `SELECT count(*)::int AS count FROM (${RETENTION_OBJECT_CANDIDATES_SQL}) candidates`,
      [evaluatedAt, cutoffs.unverified],
    );
    counts.objectDeletionCandidates = candidates.rows[0].count;
    if (execute) {
      const queued = await client.query(
        `WITH candidates AS (${RETENTION_OBJECT_CANDIDATES_SQL})
         INSERT INTO object_deletion_queue (object_key,reason,queued_at)
         SELECT object_key,reason,$1 FROM candidates
         ON CONFLICT (object_key) DO NOTHING
         RETURNING id`,
        [evaluatedAt, cutoffs.unverified],
      );
      counts.objectDeletionsQueuedNew = queued.rowCount;
    }
    for (const [name, table, predicate, cutoff] of rules) {
      const result = execute
        ? await client.query(
            `WITH deleted AS (DELETE FROM ${table} WHERE ${predicate} RETURNING 1) SELECT count(*)::int AS count FROM deleted`,
            [cutoff],
          )
        : await client.query(
            `SELECT count(*)::int AS count FROM ${table} WHERE ${predicate}`,
            [cutoff],
          );
      counts[name] = result.rows[0].count;
    }
    await client.query(execute ? "COMMIT" : "ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK");
    if (execute)
      await recordRetentionFailure({ phase: "database", error, counts });
    throw error;
  } finally {
    client.release();
  }

  const cutoffsResult = Object.fromEntries(
    Object.entries(cutoffs).map(([name, value]) => [name, value.toISOString()]),
  );
  if (!execute)
    return {
      ok: true,
      mode: "postgresql",
      execute: false,
      evaluatedAt: evaluatedAt.toISOString(),
      cutoffs: cutoffsResult,
      counts,
    };

  let objectDeletion;
  try {
    objectDeletion = await drainRetentionObjectQueue({
      deleteObject,
      startedAt,
    });
    await recordOperationalEvidence({
      type: "retention",
      status: "succeeded",
      ...retentionEvidenceIdentity(),
      details: { counts, cutoffs: cutoffsResult, objectDeletion },
      occurredAt: evaluatedAt,
    });
  } catch (error) {
    await recordRetentionFailure({
      phase: "object-storage",
      error,
      counts,
    });
    throw error;
  }
  return {
    ok: true,
    mode: "postgresql",
    execute: true,
    evaluatedAt: evaluatedAt.toISOString(),
    cutoffs: cutoffsResult,
    counts,
    objectDeletion,
  };
}

export async function loadPostgresState() {
  if (!pool) return null;
  const client = await pool.connect();
  try {
    const names = [
      "users",
      "creator_profiles",
      "verification_records",
      "sessions",
      "operator_sessions",
      "one_time_tokens",
      "assets",
      "scans",
      "matches",
      "takedown_cases",
      "case_events",
      "subscriptions",
      "billing_consents",
      "processed_webhooks",
      "audit_events",
    ];
    const results = [];
    for (const name of names)
      results.push(await client.query(`SELECT * FROM ${name}`));
    const [
      users,
      profiles,
      verifications,
      sessions,
      operatorSessions,
      tokens,
      assets,
      scans,
      matches,
      cases,
      caseEvents,
      subscriptions,
      billingConsents,
      processedWebhooks,
      audit,
    ] = results.map((result) => result.rows);
    const profile = new Map(profiles.map((row) => [row.user_id, row]));
    return {
      users: users.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        stageName: row.stage_name,
        salt: row.password_salt,
        passwordHash: row.password_hash,
        plan: row.plan,
        onboardingComplete: row.onboarding_complete,
        emailVerifiedAt: iso(row.email_verified_at),
        ageVerifiedAt: iso(row.age_verified_at),
        eligibilityAcceptedAt: iso(row.eligibility_accepted_at),
        eligibilityVersion: "2026-07-18",
        mfaSecretCiphertext: row.mfa_secret_ciphertext,
        mfaEnabledAt: iso(row.mfa_enabled_at),
        mfaRecoveryHashes: row.mfa_recovery_hashes || [],
        aliases: profile.get(row.id)?.aliases || [],
        platforms: profile.get(row.id)?.public_platforms || [],
        createdAt: iso(row.created_at),
      })),
      verifications: verifications.map((row) => ({
        id: row.id,
        userId: row.user_id,
        kind: row.kind,
        provider: row.provider,
        providerReference: row.provider_reference,
        status: row.status,
        evidence: row.evidence || {},
        expiresAt: iso(row.expires_at),
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
      })),
      sessions: sessions
        .filter((row) => new Date(row.expires_at) > new Date())
        .map((row) => ({
          tokenHash: row.token_hash,
          userId: row.user_id,
          expiresAt: iso(row.expires_at),
        })),
      operatorSessions: operatorSessions
        .filter((row) => new Date(row.expires_at) > new Date())
        .map((row) => ({
          tokenHash: row.token_hash,
          expiresAt: iso(row.expires_at),
          createdAt: iso(row.created_at),
        })),
      passwordResets: tokens
        .filter(
          (row) =>
            row.purpose === "password_reset" &&
            !row.used_at &&
            new Date(row.expires_at) > new Date(),
        )
        .map(token),
      emailVerifications: tokens
        .filter(
          (row) =>
            row.purpose === "email_verification" &&
            !row.used_at &&
            new Date(row.expires_at) > new Date(),
        )
        .map(token),
      assets: assets
        .filter((row) => !row.deleted_at)
        .map((row) => ({
          id: row.id,
          userId: row.user_id,
          objectKey: row.object_key,
          name: row.original_name,
          mime: row.mime_type,
          size: Number(row.byte_size),
          checksum: row.checksum_sha256,
          status: row.status,
          mediaFormat: row.detected_format,
          width: row.pixel_width,
          height: row.pixel_height,
          sensitiveMediaConsentAt: iso(row.sensitive_media_consent_at),
          sensitiveMediaConsentVersion: row.sensitive_media_consent_version,
          createdAt: iso(row.created_at),
        })),
      scans: scans.map((row) => ({
        id: row.id,
        userId: row.user_id,
        status: row.status,
        mode: row.mode,
        provider: row.provider,
        sourcesChecked: row.sources_checked,
        matchesFound: matches.filter((match) => match.scan_id === row.id)
          .length,
        startedAt: iso(row.started_at),
        completedAt: iso(row.completed_at),
      })),
      matches: matches.map((row) => ({
        id: row.id,
        scanId: row.scan_id,
        userId: row.user_id,
        assetId: row.asset_id,
        site: row.source_host,
        sourceUrl: row.source_url,
        type: row.media_type,
        confidence: Number(row.confidence),
        status: row.status,
        age: iso(row.discovered_at),
        evidence: row.evidence,
      })),
      cases: cases.map((row) => ({
        id: row.id,
        userId: row.user_id,
        matchId: row.match_id,
        jurisdiction: row.jurisdiction,
        status: row.status,
        mode: row.mode,
        targetUrl: row.target_url,
        targetHost: row.target_host,
        noticeType: row.notice_type,
        evidenceSnapshot: row.evidence_snapshot || {},
        evidenceHash: row.evidence_hash,
        noticeDraft: row.notice_draft || {},
        declarations: row.declarations || {},
        recipientEmail: row.recipient_email,
        recipientSource: row.recipient_source,
        legalBasis: row.legal_basis,
        preparedNoticeHash: row.prepared_notice_hash,
        preparedAt: iso(row.prepared_at),
        providerMessageId: row.provider_message_id,
        reviewedAt: iso(row.reviewed_at),
        deliveryAttempts: row.delivery_attempts || 0,
        lastDeliveryError: row.last_delivery_error,
        deliveryStatus: row.delivery_status,
        deliveredAt: iso(row.delivered_at),
        lastProviderEventAt: iso(row.last_provider_event_at),
        legalHold: Boolean(row.legal_hold),
        approvedAt: iso(row.approved_at),
        submittedAt: iso(row.submitted_at),
        nextActionAt: iso(row.next_action_at),
        closedAt: iso(row.closed_at),
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
        timeline: caseEvents
          .filter((event) => event.case_id === row.id)
          .map((event) => ({
            event: event.event_type,
            details: event.details || {},
            at: iso(event.created_at),
          })),
      })),
      subscriptions: subscriptions.map((row) => ({
        id: row.id,
        userId: row.user_id,
        plan: row.plan,
        status: row.status,
        mode: row.stripe_customer_id
          ? row.stripe_livemode
            ? "stripe_live"
            : "stripe_test"
          : "unconfigured",
        stripeLivemode: row.stripe_livemode,
        stripePriceId: row.stripe_price_id,
        stripeCustomerId: row.stripe_customer_id,
        stripeSubscriptionId: row.stripe_subscription_id,
        renewalAt: iso(row.current_period_end),
        updatedAt: iso(row.updated_at),
      })),
      billingConsents: billingConsents.map((row) => ({
        id: row.id,
        userId: row.user_id,
        plan: row.plan,
        termsVersion: row.terms_version,
        immediateServiceRequested: row.immediate_service_requested,
        coolingOffAcknowledged: row.cooling_off_acknowledged,
        stripeCheckoutSessionId: row.stripe_checkout_session_id,
        createdAt: iso(row.created_at),
      })),
      processedWebhooks: processedWebhooks.map((row) => ({
        provider: row.provider,
        eventId: row.event_id,
        processedAt: iso(row.processed_at),
      })),
      audit: audit
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 500)
        .map((row) => ({
          id: String(row.id),
          userId: row.user_id,
          actorHash: row.actor_hash,
          action: row.action,
          details: row.details,
          at: iso(row.created_at),
        })),
    };
  } finally {
    client.release();
  }
}

function token(row) {
  return {
    tokenHash: row.token_hash,
    userId: row.user_id,
    expiresAt: iso(row.expires_at),
  };
}

export async function savePostgresState(
  state,
  { deletedUserIds = [], deletedAssetIds = [], objectDeletions = [] } = {},
) {
  if (!pool) return false;
  const deletionKeys = [...new Set(objectDeletions.map(String))];
  if (deletionKeys.some((key) => key.length < 3 || key.length > 500))
    throw new Error("Object deletion key is invalid.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(824671)");
    for (const user of state.users) {
      await client.query(
        `INSERT INTO users (id,email,name,stage_name,password_salt,password_hash,plan,onboarding_complete,email_verified_at,age_verified_at,eligibility_accepted_at,mfa_secret_ciphertext,mfa_enabled_at,mfa_recovery_hashes,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,now()) ON CONFLICT (id) DO UPDATE SET
         email=EXCLUDED.email,name=EXCLUDED.name,stage_name=EXCLUDED.stage_name,password_salt=EXCLUDED.password_salt,
         password_hash=EXCLUDED.password_hash,plan=EXCLUDED.plan,onboarding_complete=EXCLUDED.onboarding_complete,
         email_verified_at=EXCLUDED.email_verified_at,age_verified_at=EXCLUDED.age_verified_at,
         eligibility_accepted_at=EXCLUDED.eligibility_accepted_at,mfa_secret_ciphertext=EXCLUDED.mfa_secret_ciphertext,
         mfa_enabled_at=EXCLUDED.mfa_enabled_at,mfa_recovery_hashes=EXCLUDED.mfa_recovery_hashes,updated_at=now()`,
        [
          user.id,
          user.email,
          user.name,
          user.stageName || "",
          user.salt,
          user.passwordHash,
          user.plan || "Protect",
          Boolean(user.onboardingComplete),
          user.emailVerifiedAt || null,
          user.ageVerifiedAt || null,
          user.eligibilityAcceptedAt || null,
          user.mfaSecretCiphertext || null,
          user.mfaEnabledAt || null,
          JSON.stringify(user.mfaRecoveryHashes || []),
          user.createdAt || new Date().toISOString(),
        ],
      );
      await client.query(
        `INSERT INTO creator_profiles (user_id,aliases,public_platforms,updated_at) VALUES ($1,$2::jsonb,$3::jsonb,now())
         ON CONFLICT (user_id) DO UPDATE SET aliases=EXCLUDED.aliases,public_platforms=EXCLUDED.public_platforms,updated_at=now()`,
        [
          user.id,
          JSON.stringify(user.aliases || []),
          JSON.stringify(user.platforms || []),
        ],
      );
    }
    if (deletedUserIds.length) {
      const heldAccounts = await client.query(
        `SELECT count(*)::int AS count FROM takedown_cases
         WHERE legal_hold=true AND user_id=ANY($1::uuid[])`,
        [deletedUserIds],
      );
      if (heldAccounts.rows[0].count)
        throw new Error("An account under legal hold cannot be deleted.");
    }
    if (deletionKeys.length)
      await client.query(
        `INSERT INTO object_deletion_queue (object_key,reason,queued_at)
         SELECT object_key,'asset-deleted',now()
         FROM unnest($1::text[]) AS object_key
         ON CONFLICT (object_key) DO NOTHING`,
        [deletionKeys],
      );
    if (deletedUserIds.length)
      await client.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
        deletedUserIds,
      ]);
    await replaceEphemeral(client, state);
    await upsertBusinessData(client, state, { deletedAssetIds });
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function replaceEphemeral(client, state) {
  await client.query("DELETE FROM sessions");
  for (const item of state.sessions)
    await client.query(
      "INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)",
      [item.tokenHash, item.userId, item.expiresAt],
    );
  await client.query("DELETE FROM operator_sessions");
  for (const item of state.operatorSessions || [])
    await client.query(
      "INSERT INTO operator_sessions (token_hash,expires_at,created_at) VALUES ($1,$2,$3)",
      [item.tokenHash, item.expiresAt, item.createdAt || new Date()],
    );
  await client.query("DELETE FROM one_time_tokens WHERE used_at IS NULL");
  for (const [purpose, records] of [
    ["password_reset", state.passwordResets],
    ["email_verification", state.emailVerifications],
  ])
    for (const item of records)
      await client.query(
        "INSERT INTO one_time_tokens (token_hash,user_id,purpose,expires_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [item.tokenHash, item.userId, purpose, item.expiresAt],
      );
}

async function upsertBusinessData(
  client,
  state,
  { deletedAssetIds = [] } = {},
) {
  for (const item of state.verifications || [])
    await client.query(
      `INSERT INTO verification_records
        (id,user_id,kind,provider,provider_reference,status,evidence,expires_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET provider_reference=EXCLUDED.provider_reference,
       status=EXCLUDED.status,evidence=EXCLUDED.evidence,expires_at=EXCLUDED.expires_at,updated_at=EXCLUDED.updated_at`,
      [
        item.id,
        item.userId,
        item.kind,
        item.provider,
        item.providerReference || null,
        item.status,
        JSON.stringify(item.evidence || {}),
        item.expiresAt || null,
        item.createdAt || new Date().toISOString(),
        item.updatedAt || new Date().toISOString(),
      ],
    );
  for (const item of state.assets)
    await client.query(
      `INSERT INTO assets (id,user_id,object_key,original_name,mime_type,byte_size,checksum_sha256,status,detected_format,pixel_width,pixel_height,sensitive_media_consent_at,sensitive_media_consent_version,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (id) DO UPDATE SET original_name=EXCLUDED.original_name,status=EXCLUDED.status,detected_format=EXCLUDED.detected_format,pixel_width=EXCLUDED.pixel_width,pixel_height=EXCLUDED.pixel_height,sensitive_media_consent_at=EXCLUDED.sensitive_media_consent_at,sensitive_media_consent_version=EXCLUDED.sensitive_media_consent_version,deleted_at=NULL`,
      [
        item.id,
        item.userId,
        item.objectKey,
        item.name,
        item.mime,
        item.size,
        item.checksum,
        item.status || "Protected",
        item.mediaFormat || null,
        item.width || null,
        item.height || null,
        item.sensitiveMediaConsentAt || null,
        item.sensitiveMediaConsentVersion || null,
        item.createdAt,
      ],
    );
  if (deletedAssetIds.length) {
    const heldAssets = await client.query(
      `SELECT count(*)::int AS count FROM assets a
       WHERE a.id=ANY($1::uuid[])
         AND EXISTS (
           SELECT 1 FROM matches m
           JOIN takedown_cases c ON c.match_id=m.id
           WHERE m.asset_id=a.id AND c.legal_hold=true
         )`,
      [deletedAssetIds],
    );
    if (heldAssets.rows[0].count)
      throw new Error("A reference file under legal hold cannot be deleted.");
    await client.query(
      `UPDATE assets SET deleted_at=now()
       WHERE id=ANY($1::uuid[]) AND deleted_at IS NULL`,
      [deletedAssetIds],
    );
  }
  for (const item of state.scans)
    await client.query(
      `INSERT INTO scans (id,user_id,status,mode,provider,sources_checked,started_at,completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,sources_checked=EXCLUDED.sources_checked,completed_at=EXCLUDED.completed_at`,
      [
        item.id,
        item.userId,
        item.status,
        item.mode,
        item.provider || null,
        item.sourcesChecked || 0,
        item.startedAt,
        item.completedAt || null,
      ],
    );
  for (const item of state.matches.filter(
    (match) => match.userId && match.scanId,
  ))
    await client.query(
      `INSERT INTO matches (id,scan_id,user_id,asset_id,source_url,source_host,media_type,confidence,status,discovered_at,evidence) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
     ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,evidence=EXCLUDED.evidence`,
      [
        item.id,
        item.scanId,
        item.userId,
        item.assetId || null,
        item.sourceUrl,
        item.site,
        item.type,
        item.confidence,
        item.status,
        item.age || new Date().toISOString(),
        JSON.stringify(item.evidence || {}),
      ],
    );
  for (const item of state.cases) {
    await client.query(
      `INSERT INTO takedown_cases (id,user_id,match_id,jurisdiction,status,mode,target_url,target_host,notice_type,evidence_snapshot,evidence_hash,notice_draft,declarations,recipient_email,recipient_source,legal_basis,prepared_notice_hash,prepared_at,provider_message_id,reviewed_at,delivery_attempts,last_delivery_error,delivery_status,delivered_at,last_provider_event_at,legal_hold,approved_at,submitted_at,next_action_at,closed_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,mode=EXCLUDED.mode,target_url=EXCLUDED.target_url,target_host=EXCLUDED.target_host,notice_type=EXCLUDED.notice_type,evidence_snapshot=EXCLUDED.evidence_snapshot,evidence_hash=EXCLUDED.evidence_hash,notice_draft=EXCLUDED.notice_draft,declarations=EXCLUDED.declarations,recipient_email=EXCLUDED.recipient_email,recipient_source=EXCLUDED.recipient_source,legal_basis=EXCLUDED.legal_basis,prepared_notice_hash=EXCLUDED.prepared_notice_hash,prepared_at=EXCLUDED.prepared_at,provider_message_id=EXCLUDED.provider_message_id,reviewed_at=EXCLUDED.reviewed_at,delivery_attempts=EXCLUDED.delivery_attempts,last_delivery_error=EXCLUDED.last_delivery_error,delivery_status=EXCLUDED.delivery_status,delivered_at=EXCLUDED.delivered_at,last_provider_event_at=EXCLUDED.last_provider_event_at,legal_hold=EXCLUDED.legal_hold,approved_at=EXCLUDED.approved_at,submitted_at=EXCLUDED.submitted_at,next_action_at=EXCLUDED.next_action_at,closed_at=EXCLUDED.closed_at,updated_at=EXCLUDED.updated_at`,
      [
        item.id,
        item.userId,
        item.matchId,
        item.jurisdiction || null,
        item.status,
        item.mode || "sandbox",
        item.targetUrl || null,
        item.targetHost || item.source || null,
        item.noticeType || "copyright",
        JSON.stringify(item.evidenceSnapshot || {}),
        item.evidenceHash || null,
        JSON.stringify(item.noticeDraft || {}),
        JSON.stringify(item.declarations || {}),
        item.recipientEmail || null,
        item.recipientSource || null,
        item.legalBasis || null,
        item.preparedNoticeHash || null,
        item.preparedAt || null,
        item.providerMessageId || null,
        item.reviewedAt || null,
        item.deliveryAttempts || 0,
        item.lastDeliveryError || null,
        item.deliveryStatus || null,
        item.deliveredAt || null,
        item.lastProviderEventAt || null,
        Boolean(item.legalHold),
        item.approvedAt || null,
        item.submittedAt || null,
        item.nextActionAt || null,
        item.closedAt || null,
        item.createdAt,
        item.updatedAt || item.createdAt,
      ],
    );
    for (const event of item.timeline || [])
      await client.query(
        `INSERT INTO case_events (case_id,event_type,details,created_at)
         SELECT $1,$2,$3::jsonb,$4 WHERE NOT EXISTS (
           SELECT 1 FROM case_events WHERE case_id=$1 AND event_type=$2 AND created_at=$4
         )`,
        [item.id, event.event, JSON.stringify(event.details || {}), event.at],
      );
  }
  for (const item of state.subscriptions)
    await client.query(
      `INSERT INTO subscriptions (id,user_id,plan,status,stripe_customer_id,stripe_subscription_id,current_period_end,stripe_livemode,stripe_price_id,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
     ON CONFLICT (user_id) DO UPDATE SET plan=EXCLUDED.plan,status=EXCLUDED.status,stripe_customer_id=EXCLUDED.stripe_customer_id,stripe_subscription_id=EXCLUDED.stripe_subscription_id,current_period_end=EXCLUDED.current_period_end,stripe_livemode=EXCLUDED.stripe_livemode,stripe_price_id=EXCLUDED.stripe_price_id,updated_at=now()`,
      [
        item.id,
        item.userId,
        item.plan,
        item.status,
        item.stripeCustomerId || null,
        item.stripeSubscriptionId || null,
        item.renewalAt || null,
        Boolean(item.stripeLivemode),
        item.stripePriceId || null,
      ],
    );
  for (const item of state.billingConsents || [])
    await client.query(
      `INSERT INTO billing_consents
       (id,user_id,plan,terms_version,immediate_service_requested,cooling_off_acknowledged,stripe_checkout_session_id,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (stripe_checkout_session_id) DO NOTHING`,
      [
        item.id,
        item.userId,
        item.plan,
        item.termsVersion,
        Boolean(item.immediateServiceRequested),
        Boolean(item.coolingOffAcknowledged),
        item.stripeCheckoutSessionId,
        item.createdAt || new Date(),
      ],
    );
  for (const item of state.processedWebhooks || [])
    await client.query(
      `INSERT INTO processed_webhooks (provider,event_id,processed_at)
       VALUES ($1,$2,$3) ON CONFLICT (provider,event_id) DO NOTHING`,
      [item.provider, item.eventId, item.processedAt || new Date()],
    );
  const newAuditEvents = state.audit.filter(
    (event) => !/^\d+$/.test(String(event.id)),
  );
  if (newAuditEvents.length) {
    const headResult = await client.query(
        `SELECT sequence_no,event_hash FROM audit_events
         WHERE hash_version=1 ORDER BY sequence_no DESC LIMIT 1`,
      ),
      head = headResult.rows[0];
    let sequenceNo = Number(head?.sequence_no || 0),
      previousHash = head?.event_hash || null;
    for (const item of [...newAuditEvents].reverse()) {
      const event = protectAuditEvent(
        {
          eventUuid: item.id,
          userId: item.userId,
          actorHash: item.actorHash,
          actorSubject: item.actorSubject,
          action: item.action,
          details: item.details || {},
          ipHash: item.ipHash,
          at: item.at,
        },
        {
          masterSecret: auditMasterSecret(),
          sequenceNo: ++sequenceNo,
          previousHash,
        },
      );
      await client.query(
        `INSERT INTO audit_events
           (event_uuid,sequence_no,user_id,actor_hash,action,details,ip_hash,previous_hash,event_hash,hash_version,created_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11)`,
        [
          event.eventUuid,
          event.sequenceNo,
          item.userId,
          event.actorHash,
          event.action,
          JSON.stringify(event.details),
          event.ipHash,
          event.previousHash,
          event.eventHash,
          event.hashVersion,
          event.createdAt,
        ],
      );
      previousHash = event.eventHash;
    }
    const rows = await auditRows(client);
    verifyAuditChain(rows.map(auditRecord), auditMasterSecret());
  }
}
