import pg from "pg";

const { Pool } = pg;
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
  : null;
const iso = (value) => (value ? new Date(value).toISOString() : null);

export const databaseMode = () => (pool ? "postgresql" : "local-json");

export async function databaseProbe() {
  if (!pool) return { ok: true, mode: "local-json" };
  const startedAt = Date.now();
  await pool.query("SELECT 1");
  return {
    ok: true,
    mode: "postgresql",
    latencyMs: Date.now() - startedAt,
  };
}

export async function closeDatabase() {
  if (pool) await pool.end();
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

export async function runRetention({ execute = false, now = new Date() } = {}) {
  if (!pool) return { ok: true, mode: "local-json", execute, counts: {} };
  const client = await pool.connect();
  const cutoffs = {
    unverified: new Date(now.getTime() - 30 * 86400000),
    verification: new Date(now.getTime() - 90 * 86400000),
    operational: new Date(now.getTime() - 365 * 86400000),
    legal: new Date(now.getTime() - 6 * 365.25 * 86400000),
  };
  const rules = [
    ["expiredSessions", "sessions", "expires_at < $1", now],
    ["expiredOperatorSessions", "operator_sessions", "expires_at < $1", now],
    [
      "expiredTokens",
      "one_time_tokens",
      "expires_at < $1 OR used_at IS NOT NULL",
      now,
    ],
    [
      "failedVerifications",
      "verification_records",
      "status IN ('failed','expired') AND updated_at < $1",
      cutoffs.verification,
    ],
    ["oldAuditEvents", "audit_events", "created_at < $1", cutoffs.operational],
    [
      "oldWebhookReceipts",
      "processed_webhooks",
      "processed_at < $1",
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
      now,
    ],
  ];
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(824672)");
    const counts = {};
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
    return {
      ok: true,
      mode: "postgresql",
      execute,
      evaluatedAt: now.toISOString(),
      cutoffs: Object.fromEntries(
        Object.entries(cutoffs).map(([name, value]) => [name, value.toISOString()]),
      ),
      counts,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

export async function savePostgresState(state) {
  if (!pool) return false;
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
    const userIds = state.users.map((user) => user.id);
    await client.query(
      userIds.length
        ? "DELETE FROM users WHERE NOT (id = ANY($1::uuid[]))"
        : "DELETE FROM users",
      userIds.length ? [userIds] : [],
    );
    await replaceEphemeral(client, state);
    await upsertBusinessData(client, state);
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

async function upsertBusinessData(client, state) {
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
  const assetIds = state.assets.map((item) => item.id);
  await client.query(
    assetIds.length
      ? "UPDATE assets SET deleted_at=now() WHERE deleted_at IS NULL AND NOT (id = ANY($1::uuid[]))"
      : "UPDATE assets SET deleted_at=now() WHERE deleted_at IS NULL",
    assetIds.length ? [assetIds] : [],
  );
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
      `INSERT INTO takedown_cases (id,user_id,match_id,jurisdiction,status,mode,target_url,target_host,notice_type,evidence_snapshot,evidence_hash,notice_draft,declarations,recipient_email,recipient_source,provider_message_id,reviewed_at,delivery_attempts,last_delivery_error,delivery_status,delivered_at,last_provider_event_at,legal_hold,approved_at,submitted_at,next_action_at,closed_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,mode=EXCLUDED.mode,target_url=EXCLUDED.target_url,target_host=EXCLUDED.target_host,notice_type=EXCLUDED.notice_type,evidence_snapshot=EXCLUDED.evidence_snapshot,evidence_hash=EXCLUDED.evidence_hash,notice_draft=EXCLUDED.notice_draft,declarations=EXCLUDED.declarations,recipient_email=EXCLUDED.recipient_email,recipient_source=EXCLUDED.recipient_source,provider_message_id=EXCLUDED.provider_message_id,reviewed_at=EXCLUDED.reviewed_at,delivery_attempts=EXCLUDED.delivery_attempts,last_delivery_error=EXCLUDED.last_delivery_error,delivery_status=EXCLUDED.delivery_status,delivered_at=EXCLUDED.delivered_at,last_provider_event_at=EXCLUDED.last_provider_event_at,legal_hold=EXCLUDED.legal_hold,approved_at=EXCLUDED.approved_at,submitted_at=EXCLUDED.submitted_at,next_action_at=EXCLUDED.next_action_at,closed_at=EXCLUDED.closed_at,updated_at=EXCLUDED.updated_at`,
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
  for (const item of state.audit.filter(
    (event) => !/^\d+$/.test(String(event.id)),
  ))
    await client.query(
      "INSERT INTO audit_events (user_id,action,details,created_at) VALUES ($1,$2,$3::jsonb,$4)",
      [item.userId, item.action, JSON.stringify(item.details || {}), item.at],
    );
}
