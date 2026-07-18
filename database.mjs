import pg from "pg";

const { Pool } = pg;
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
  : null;
const iso = (value) => (value ? new Date(value).toISOString() : null);

export const databaseMode = () => (pool ? "postgresql" : "local-json");

export async function loadPostgresState() {
  if (!pool) return null;
  const client = await pool.connect();
  try {
    const names = [
      "users",
      "creator_profiles",
      "sessions",
      "one_time_tokens",
      "assets",
      "scans",
      "matches",
      "takedown_cases",
      "subscriptions",
      "audit_events",
    ];
    const results = await Promise.all(
      names.map((name) => client.query(`SELECT * FROM ${name}`)),
    );
    const [
      users,
      profiles,
      sessions,
      tokens,
      assets,
      scans,
      matches,
      cases,
      subscriptions,
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
        eligibilityAcceptedAt: iso(row.age_verified_at),
        eligibilityVersion: "2026-07-18",
        aliases: profile.get(row.id)?.aliases || [],
        platforms: profile.get(row.id)?.public_platforms || [],
        createdAt: iso(row.created_at),
      })),
      sessions: sessions
        .filter((row) => new Date(row.expires_at) > new Date())
        .map((row) => ({
          tokenHash: row.token_hash,
          userId: row.user_id,
          expiresAt: iso(row.expires_at),
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
        approvedAt: iso(row.approved_at),
        closedAt: iso(row.closed_at),
        createdAt: iso(row.created_at),
      })),
      subscriptions: subscriptions.map((row) => ({
        id: row.id,
        userId: row.user_id,
        plan: row.plan,
        status: row.status,
        mode: row.stripe_customer_id ? "stripe_test" : "sandbox",
        stripeCustomerId: row.stripe_customer_id,
        stripeSubscriptionId: row.stripe_subscription_id,
        renewalAt: iso(row.current_period_end),
        updatedAt: iso(row.updated_at),
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
        `INSERT INTO users (id,email,name,stage_name,password_salt,password_hash,plan,onboarding_complete,email_verified_at,age_verified_at,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) ON CONFLICT (id) DO UPDATE SET
         email=EXCLUDED.email,name=EXCLUDED.name,stage_name=EXCLUDED.stage_name,password_salt=EXCLUDED.password_salt,
         password_hash=EXCLUDED.password_hash,plan=EXCLUDED.plan,onboarding_complete=EXCLUDED.onboarding_complete,
         email_verified_at=EXCLUDED.email_verified_at,age_verified_at=EXCLUDED.age_verified_at,updated_at=now()`,
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
          user.eligibilityAcceptedAt || null,
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
  for (const item of state.assets)
    await client.query(
      `INSERT INTO assets (id,user_id,object_key,original_name,mime_type,byte_size,checksum_sha256,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET original_name=EXCLUDED.original_name,status=EXCLUDED.status,deleted_at=NULL`,
      [
        item.id,
        item.userId,
        item.objectKey,
        item.name,
        item.mime,
        item.size,
        item.checksum,
        item.status || "Protected",
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
  for (const item of state.cases)
    await client.query(
      `INSERT INTO takedown_cases (id,user_id,match_id,jurisdiction,status,mode,approved_at,closed_at,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,approved_at=EXCLUDED.approved_at,closed_at=EXCLUDED.closed_at`,
      [
        item.id,
        item.userId,
        item.matchId,
        item.jurisdiction || null,
        item.status,
        item.mode || "sandbox",
        item.approvedAt || null,
        item.closedAt || null,
        item.createdAt,
      ],
    );
  for (const item of state.subscriptions)
    await client.query(
      `INSERT INTO subscriptions (id,user_id,plan,status,stripe_customer_id,stripe_subscription_id,current_period_end,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now())
     ON CONFLICT (user_id) DO UPDATE SET plan=EXCLUDED.plan,status=EXCLUDED.status,stripe_customer_id=EXCLUDED.stripe_customer_id,stripe_subscription_id=EXCLUDED.stripe_subscription_id,current_period_end=EXCLUDED.current_period_end,updated_at=now()`,
      [
        item.id,
        item.userId,
        item.plan,
        item.status,
        item.stripeCustomerId || null,
        item.stripeSubscriptionId || null,
        item.renewalAt || null,
      ],
    );
  for (const item of state.audit.filter(
    (event) => !/^\d+$/.test(String(event.id)),
  ))
    await client.query(
      "INSERT INTO audit_events (user_id,action,details,created_at) VALUES ($1,$2,$3::jsonb,$4)",
      [item.userId, item.action, JSON.stringify(item.details || {}), item.at],
    );
}
