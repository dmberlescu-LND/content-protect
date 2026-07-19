import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
} from "node:crypto";
import path from "node:path";
import Stripe from "stripe";
import { Webhook } from "svix";
import {
  deleteEncryptedObject,
  getEncryptedObject,
  putEncryptedObject,
  storageProbe,
  storageMode,
  externalMasterKeyRequired,
} from "./storage.mjs";
import {
  archiveAccountingRecords,
  closeDatabase,
  consumeRateLimit,
  databaseProbe,
  initializeAuditIntegrity,
  latestOperationalEvidence,
  loadPostgresState,
  recordOperationalEvidence,
  savePostgresState,
} from "./database.mjs";
import { scannerMode, ScanProviderError, searchImage } from "./scanner.mjs";
import { findActiveSubscription, scanIntervalMs } from "./billing-policy.mjs";
import { inspectMedia, MediaValidationError } from "./media-validation.mjs";
import { operationsReadiness } from "./operations-readiness.mjs";
import { unsafeRequestOriginAllowed } from "./security-policy.mjs";
import {
  buildYotiAgeShareConfiguration,
  createYotiDigitalIdentityClient,
  interpretYotiAgeReceipt,
  yotiConfiguration,
  yotiReceiptAlreadyUsed,
  YOTI_SHARE_ID,
} from "./yoti-digital-identity.mjs";
import {
  exactNoticeApproved,
  noticeText,
  textDigest,
} from "./takedown-policy.mjs";
import {
  checkoutIdempotencyKey,
  reconcileStripeSubscription,
  STRIPE_SUBSCRIPTION_EVENTS,
  stripeSubscriptionId,
} from "./stripe-subscription-policy.mjs";
import { COMPLIANCE_VERSIONS } from "./compliance-versions.mjs";
import { BACKUP_TABLES } from "./backup-snapshot.mjs";

const PORT = Number(process.env.PORT || 8787),
  STARTED_AT = Date.now(),
  ROOT = process.env.CONTENT_PROTECT_DATA_DIR
    ? path.resolve(process.env.CONTENT_PROTECT_DATA_DIR)
    : path.join(process.cwd(), ".traceguard-data"),
  DB = path.join(ROOT, "db.json"),
  VAULT = path.join(ROOT, "vault"),
  KEY_FILE = path.join(ROOT, ".vault-key");
const PAYMENTS_MODE = ["test", "live"].includes(process.env.PAYMENTS_MODE)
    ? process.env.PAYMENTS_MODE
    : "unconfigured",
  TAKEDOWNS_MODE = ["sandbox", "live"].includes(process.env.TAKEDOWNS_MODE)
    ? process.env.TAKEDOWNS_MODE
    : "unconfigured",
  YOTI_MODE = ["sandbox", "live"].includes(process.env.YOTI_MODE)
    ? process.env.YOTI_MODE
    : "unconfigured",
  STRIPE_KEY =
    (PAYMENTS_MODE === "test" &&
      process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) ||
    (PAYMENTS_MODE === "live" &&
      process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_"))
      ? process.env.STRIPE_SECRET_KEY
      : null,
  STRIPE_PRICES = {
    Monitor: process.env.STRIPE_PRICE_MONITOR,
    Protect: process.env.STRIPE_PRICE_PROTECT,
    Pro: process.env.STRIPE_PRICE_PRO,
  },
  STRIPE_CONFIGURED = Boolean(
    STRIPE_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_") &&
    Object.values(STRIPE_PRICES).every((value) =>
      /^price_[A-Za-z0-9]+$/.test(value || ""),
    ),
  );
let YOTI_CONFIGURATION;
try {
  YOTI_CONFIGURATION = yotiConfiguration();
} catch (error) {
  console.error(
    "Yoti configuration is invalid; age checks are disabled",
    error.message,
  );
  YOTI_CONFIGURATION = { configured: false };
}
const YOTI_CONFIGURED = YOTI_CONFIGURATION.configured;
const RESEND_EMAIL_CONFIGURED = Boolean(
  process.env.RESEND_API_KEY?.startsWith("re_") &&
  emailFromAddress(process.env.RESET_FROM_EMAIL) &&
  emailFromAddress(process.env.TAKEDOWN_FROM_EMAIL),
);
const RESEND_WEBHOOK_CONFIGURED = Boolean(
  process.env.RESEND_WEBHOOK_SECRET?.startsWith("whsec_"),
);
const TAKEDOWN_TEMPLATE_VERSION = COMPLIANCE_VERSIONS.takedownTemplate;
const TAKEDOWN_LEGAL_TEMPLATES_APPROVED =
  process.env.TAKEDOWN_LEGAL_APPROVED_VERSION === TAKEDOWN_TEMPLATE_VERSION;
const TAKEDOWN_DELIVERY_CONFIGURED = Boolean(
  RESEND_EMAIL_CONFIGURED &&
  RESEND_WEBHOOK_CONFIGURED &&
  process.env.TAKEDOWN_OPERATOR_TOKEN?.length >= 32 &&
  TAKEDOWN_LEGAL_TEMPLATES_APPROVED,
);
const TAKEDOWN_DELIVERY_LIVE = Boolean(
  TAKEDOWN_DELIVERY_CONFIGURED && TAKEDOWNS_MODE === "live",
);
let key;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function emailFromAddress(value) {
  const match = String(value || "").match(/<([^>]+)>\s*$/);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    match?.[1] || String(value || "").trim(),
  );
}
async function load() {
  await mkdir(VAULT, { recursive: true });
  if (!key) {
    if (process.env.CONTENT_PROTECT_MASTER_KEY) {
      const secret = process.env.CONTENT_PROTECT_MASTER_KEY;
      key = /^[a-f0-9]{64}$/i.test(secret)
        ? Buffer.from(secret, "hex")
        : createHash("sha256").update(secret).digest();
    } else if (externalMasterKeyRequired())
      throw new Error(
        "CONTENT_PROTECT_MASTER_KEY is required when private object storage is enabled.",
      );
    else if (existsSync(KEY_FILE))
      key = Buffer.from((await readFile(KEY_FILE, "utf8")).trim(), "hex");
    else {
      key = randomBytes(32);
      await writeFile(KEY_FILE, key.toString("hex"), { mode: 0o600 });
    }
  }
  const postgresState = await loadPostgresState();
  if (postgresState) {
    if (!postgresState.users.length && existsSync(DB)) {
      const legacyState = JSON.parse(await readFile(DB, "utf8"));
      legacyState.scans ||= [];
      legacyState.subscriptions ||= [];
      legacyState.billingConsents ||= [];
      legacyState.audit ||= [];
      legacyState.assets ||= [];
      legacyState.cases ||= [];
      legacyState.sessions ||= [];
      legacyState.passwordResets ||= [];
      legacyState.emailVerifications ||= [];
      legacyState.verifications ||= [];
      legacyState.processedWebhooks ||= [];
      legacyState.operatorSessions ||= [];
      for (const asset of legacyState.assets) {
        asset.objectKey ||= `${asset.id}.vault`;
        if (!asset.checksum) {
          try {
            const encrypted = await readFile(path.join(VAULT, asset.objectKey));
            asset.checksum = createHash("sha256")
              .update(encrypted)
              .digest("hex");
          } catch {
            asset.checksum = createHash("sha256")
              .update(`${asset.id}:${asset.userId}:legacy`)
              .digest("hex");
          }
        }
      }
      legacyState.matches = (legacyState.matches || []).filter(
        (match) => match.userId && match.scanId,
      );
      const migratedMatchIds = new Set(
        legacyState.matches.map((match) => match.id),
      );
      legacyState.cases = legacyState.cases.filter((item) =>
        migratedMatchIds.has(item.matchId),
      );
      await savePostgresState(legacyState);
      return (await loadPostgresState()) || postgresState;
    }
    return postgresState;
  }
  if (!existsSync(DB)) {
    const d = {
      users: [],
      assets: [],
      cases: [],
      matches: [],
      scans: [],
      subscriptions: [],
      billingConsents: [],
      audit: [],
      sessions: [],
      passwordResets: [],
      emailVerifications: [],
      verifications: [],
      processedWebhooks: [],
      operatorSessions: [],
    };
    await save(d);
    return d;
  }
  const d = JSON.parse(await readFile(DB, "utf8"));
  d.scans ||= [];
  d.subscriptions ||= [];
  d.billingConsents ||= [];
  d.audit ||= [];
  d.assets ||= [];
  d.cases ||= [];
  d.sessions ||= [];
  d.passwordResets ||= [];
  d.emailVerifications ||= [];
  d.verifications ||= [];
  d.processedWebhooks ||= [];
  d.operatorSessions ||= [];
  d.sessions = d.sessions.filter((x) => new Date(x.expiresAt) > new Date());
  d.passwordResets = d.passwordResets.filter(
    (x) => new Date(x.expiresAt) > new Date(),
  );
  d.emailVerifications = d.emailVerifications.filter(
    (x) => new Date(x.expiresAt) > new Date(),
  );
  return d;
}
async function save(d) {
  if (await savePostgresState(d)) return;
  await writeFile(DB, JSON.stringify(d, null, 2));
}
const securityHeaders = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "content-security-policy":
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://www.yoti.com; script-src 'self' https://www.yoti.com; connect-src 'self' https://api.yoti.com https://www.yoti.com; frame-src https://www.yoti.com https://api.yoti.com",
};
function send(res, status, data, headers = {}) {
  res.writeHead(status, {
    ...securityHeaders,
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-request-id": res.requestId || "unavailable",
    ...headers,
  });
  res.end(JSON.stringify(data));
}
function sendDownload(res, data, contentType, filename) {
  res.writeHead(200, {
    ...securityHeaders,
    "content-type": contentType,
    "content-length": data.length,
    "content-disposition": `attachment; filename="${filename}"`,
    "cache-control": "no-store, private",
    "x-content-type-options": "nosniff",
    "x-request-id": res.requestId || "unavailable",
  });
  res.end(data);
}
async function staticFile(req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]),
    rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
  const requested = path.resolve(process.cwd(), "dist", rel);
  const distRoot = path.resolve(process.cwd(), "dist");
  if (!requested.startsWith(distRoot)) return false;
  try {
    const data = await readFile(requested);
    const ext = path.extname(requested),
      canonicalPath = rel === "index.html" ? "" : rel,
      types = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".txt": "text/plain; charset=utf-8",
        ".xml": "application/xml; charset=utf-8",
        ".webmanifest": "application/manifest+json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".ico": "image/x-icon",
      },
      revalidate = new Set([".html", ".txt", ".xml", ".webmanifest"]).has(ext);
    res.writeHead(200, {
      ...securityHeaders,
      "content-type": types[ext] || "application/octet-stream",
      ...(ext === ".html"
        ? {
            link: `<https://content-protect.com/${canonicalPath}>; rel="canonical"`,
          }
        : {}),
      "cache-control": revalidate
        ? "no-cache"
        : "public, max-age=31536000, immutable",
    });
    res.end(data);
    return true;
  } catch {
    if (urlPath === "/operator") {
      try {
        const data = await readFile(path.join(distRoot, "index.html"));
        res.writeHead(200, {
          ...securityHeaders,
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-cache",
          "x-robots-tag": "noindex, nofollow, noarchive",
        });
        res.end(data);
        return true;
      } catch {}
    }
    return false;
  }
}
async function parse(req) {
  const out = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > 12e6) throw Error("large");
    out.push(c);
  }
  return out.length ? JSON.parse(Buffer.concat(out)) : {};
}
async function raw(req) {
  const out = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > 12e6) throw Error("large");
    out.push(c);
  }
  return Buffer.concat(out);
}
function pass(p, s = randomBytes(16).toString("hex")) {
  return { s, h: scryptSync(p, s, 64).toString("hex") };
}
function cookie(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .filter(Boolean)
      .map((x) => x.trim().split("=")),
  );
}
function tokenHash(token) {
  return createHash("sha256")
    .update(token || "")
    .digest("hex");
}
function clientIp(req) {
  return String(
    req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown",
  )
    .split(",")[0]
    .trim();
}
async function allowed(req, key, max, windowMs) {
  return consumeRateLimit({ key, max, windowMs });
}
function validPassword(value, min = 10) {
  return (
    typeof value === "string" && value.length >= min && value.length <= 128
  );
}
function passwordMatches(user, value) {
  if (typeof value !== "string" || value.length > 128) return false;
  const candidate = scryptSync(value, user.salt, 64);
  return timingSafeEqual(candidate, Buffer.from(user.passwordHash, "hex"));
}
function attachmentName(value, fallback) {
  const cleaned = String(value || "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return cleaned || fallback;
}
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(buffer) {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let index = 0; index < bits.length; index += 5)
    output +=
      BASE32_ALPHABET[parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  return output;
}
function base32Decode(value) {
  const normalised = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const character of normalised) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Invalid authenticator secret.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8)
    bytes.push(parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}
function totpAt(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30000),
    message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret))
      .update(message)
      .digest(),
    offset = digest[digest.length - 1] & 15,
    number =
      (((digest[offset] & 127) << 24) |
        ((digest[offset + 1] & 255) << 16) |
        ((digest[offset + 2] & 255) << 8) |
        (digest[offset + 3] & 255)) %
      1000000;
  return String(number).padStart(6, "0");
}
function validTotp(secret, value) {
  const code = String(value || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return false;
  return [-30000, 0, 30000].some((offset) => {
    const expected = Buffer.from(totpAt(secret, Date.now() + offset));
    return timingSafeEqual(expected, Buffer.from(code));
  });
}
function mfaSecret(user) {
  return user.mfaSecretCiphertext
    ? unvault(Buffer.from(user.mfaSecretCiphertext, "base64")).toString("utf8")
    : null;
}
function recoveryHash(value) {
  return tokenHash(
    `mfa-recovery:${String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")}`,
  );
}
function consumeMfaCode(user, value) {
  const hash = recoveryHash(value),
    index = (user.mfaRecoveryHashes || []).indexOf(hash);
  if (index >= 0) {
    user.mfaRecoveryHashes.splice(index, 1);
    return "recovery";
  }
  const secret = mfaSecret(user);
  return secret && validTotp(secret, value) ? "totp" : null;
}
function newSession(d, u) {
  const token = randomBytes(32).toString("hex");
  d.sessions.push({
    tokenHash: tokenHash(token),
    userId: u.id,
    expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
  });
  return token;
}
function userFor(req, d) {
  const s = d.sessions.find(
    (x) => x.tokenHash === tokenHash(cookie(req).cp_session),
  );
  return d.users.find((x) => x.id === s?.userId);
}
function safe(u, d) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    stageName: u.stageName,
    aliases: u.aliases || [],
    platforms: u.platforms || [],
    plan: d ? activeSubscription(d, u.id)?.plan || "Unsubscribed" : u.plan,
    onboardingComplete: u.onboardingComplete,
    emailVerifiedAt: u.emailVerifiedAt || null,
    ageVerifiedAt: u.ageVerifiedAt || null,
    eligibilityAcceptedAt: u.eligibilityAcceptedAt || null,
    mfaEnabled: Boolean(u.mfaEnabledAt),
    mfaRecoveryCodesRemaining: (u.mfaRecoveryHashes || []).length,
    createdAt: u.createdAt,
  };
}
function activeSubscription(d, userId) {
  return findActiveSubscription(d.subscriptions, userId, {
    paymentsMode: PAYMENTS_MODE,
    prices: STRIPE_PRICES,
  });
}
function vault(buf) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key, iv),
    data = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]);
}
function unvault(encrypted) {
  if (!Buffer.isBuffer(encrypted) || encrypted.length < 29)
    throw new Error("Invalid encrypted object.");
  const iv = encrypted.subarray(0, 12),
    tag = encrypted.subarray(12, 28),
    decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(encrypted.subarray(28)),
    decipher.final(),
  ]);
}
function audit(d, u, action, details = {}) {
  d.audit.unshift({
    id: randomUUID(),
    userId: u.id,
    action,
    details,
    at: new Date().toISOString(),
  });
  d.audit = d.audit.slice(0, 500);
}
function evidenceDigest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function safeHttpsReference(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !url.hostname
    )
      return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}
function buildCopyrightNotice(user, match, caseId, capturedAt) {
  return {
    version: TAKEDOWN_TEMPLATE_VERSION,
    type: "copyright-removal-request",
    caseReference: caseId,
    claimant: {
      name: user.name,
      stageName: user.stageName || null,
      replyEmail: user.email,
    },
    work: {
      referenceAssetId: match.assetId,
      unauthorisedUrl: match.sourceUrl,
      host: match.site,
      discoveredAt: match.age,
      capturedAt,
    },
    request:
      "Please remove or disable access to the identified material and preserve relevant records in accordance with applicable law and your platform policies.",
    declarationsRequired: [
      "rights_holder_or_authorised_agent",
      "good_faith_unauthorised_use",
      "information_accurate",
      "authorise_delivery",
    ],
  };
}
function operatorTokenValid(value) {
  return secretTokenValid(value, process.env.TAKEDOWN_OPERATOR_TOKEN);
}
function secretTokenValid(value, expectedValue) {
  const supplied = String(value || ""),
    expected = String(expectedValue || "");
  if (supplied.length < 32 || expected.length < 32) return false;
  const a = createHash("sha256").update(supplied).digest(),
    b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
function monitoringTokenValid(value) {
  return secretTokenValid(value, process.env.MONITORING_HEARTBEAT_TOKEN);
}
function operatorAuthorised(req, d) {
  const supplied = String(req.headers.authorization || "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (operatorTokenValid(supplied)) return true;
  const sessionHash = tokenHash(cookie(req).cp_operator || "");
  return (d.operatorSessions || []).some(
    (item) =>
      item.tokenHash === sessionHash && new Date(item.expiresAt) > new Date(),
  );
}
async function deliverNotice(caseRecord, creator, recipientEmail) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "user-agent": "Content-Protect/1.0",
      "idempotency-key": `takedown-${caseRecord.id}`,
    },
    body: JSON.stringify({
      from:
        process.env.TAKEDOWN_FROM_EMAIL ||
        "Content Protect Legal <legal@content-protect.com>",
      to: [recipientEmail],
      subject: `Copyright removal request — ${caseRecord.id}`,
      text: noticeText(caseRecord, creator),
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`delivery-provider-${response.status}`);
  if (!result.id) throw new Error("delivery-provider-invalid-response");
  return result.id;
}
async function issueEmailVerification(d, u) {
  if (!process.env.RESEND_API_KEY?.startsWith("re_")) return false;
  const token = randomBytes(32).toString("hex"),
    verifyUrl = `${(process.env.APP_URL || "https://content-protect.com").replace(/\/$/, "")}/?verify=${token}`,
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
        "user-agent": "Content-Protect/1.0",
      },
      body: JSON.stringify({
        from:
          process.env.RESET_FROM_EMAIL ||
          "Content Protect <security@content-protect.com>",
        to: [u.email],
        subject: "Verify your Content Protect email",
        text: `Verify your email using this secure link within 24 hours: ${verifyUrl}\n\nIf you did not create this account, ignore this email.`,
      }),
    });
  if (!response.ok) {
    console.error(
      "Email verification provider rejected request",
      response.status,
    );
    return false;
  }
  d.emailVerifications = d.emailVerifications.filter((x) => x.userId !== u.id);
  d.emailVerifications.push({
    tokenHash: tokenHash(token),
    userId: u.id,
    expiresAt: new Date(Date.now() + 24 * 3600000).toISOString(),
  });
  return true;
}

const appServer = http.createServer(async (req, res) => {
  const requestStartedAt = Date.now();
  const suppliedRequestId = req.headers["x-request-id"]?.toString();
  res.requestId = /^[A-Za-z0-9._:-]{1,80}$/.test(suppliedRequestId || "")
    ? suppliedRequestId
    : randomUUID();
  res.once("finish", () => {
    console.log(
      JSON.stringify({
        level: "info",
        event: "http_request",
        requestId: res.requestId,
        method: req.method,
        path: req.url.split("?")[0],
        status: res.statusCode,
        durationMs: Date.now() - requestStartedAt,
      }),
    );
  });
  try {
    if (!req.url.startsWith("/api/")) {
      if (process.env.NODE_ENV === "production" && (await staticFile(req, res)))
        return;
      return send(res, 404, { error: "Not found" });
    }
    const route = req.url.split("?")[0];
    const ip = clientIp(req),
      origin = req.headers.origin,
      appOrigin = new URL(process.env.APP_URL || "https://content-protect.com")
        .origin;
    if (
      !unsafeRequestOriginAllowed({
        method: req.method,
        route,
        origin,
        appOrigin,
        production: process.env.NODE_ENV === "production",
      })
    )
      return send(res, 403, { error: "Invalid request origin." });
    if (route === "/api/billing/webhook" && req.method === "POST") {
      if (!STRIPE_CONFIGURED)
        return send(res, 503, { error: "Webhook is not configured." });
      const stripe = new Stripe(STRIPE_KEY),
        payload = await raw(req);
      let event;
      try {
        event = stripe.webhooks.constructEvent(
          payload,
          req.headers["stripe-signature"],
          process.env.STRIPE_WEBHOOK_SECRET,
        );
      } catch {
        return send(res, 400, { error: "Invalid webhook signature." });
      }
      if (Boolean(event.livemode) !== (PAYMENTS_MODE === "live"))
        return send(res, 400, { error: "Webhook mode mismatch." });
      const d = await load();
      if (
        d.processedWebhooks.some(
          (item) => item.provider === "stripe" && item.eventId === event.id,
        )
      )
        return send(res, 200, { received: true, duplicate: true });
      if (STRIPE_SUBSCRIPTION_EVENTS.has(event.type)) {
        const object = event.data.object,
          subscriptionId = stripeSubscriptionId(object),
          customerId =
            typeof object.customer === "string" ? object.customer : null,
          existing = d.subscriptions.find(
            (item) =>
              (subscriptionId &&
                item.stripeSubscriptionId === subscriptionId) ||
              (customerId && item.stripeCustomerId === customerId),
          );
        if (subscriptionId) {
          const stripeSubscription =
              await stripe.subscriptions.retrieve(subscriptionId),
            reconciled = reconcileStripeSubscription(stripeSubscription, {
              prices: STRIPE_PRICES,
              paymentsMode: PAYMENTS_MODE,
              fallbackUserId: object.metadata?.userId || existing?.userId,
            });
          if (reconciled.valid) {
            let sub =
              existing ||
              d.subscriptions.find((item) => item.userId === reconciled.userId);
            if (!sub) {
              sub = { id: randomUUID(), userId: reconciled.userId };
              d.subscriptions.push(sub);
            }
            Object.assign(sub, {
              plan: reconciled.plan,
              status: reconciled.status,
              mode: `stripe_${PAYMENTS_MODE}`,
              stripeLivemode: reconciled.stripeLivemode,
              stripePriceId: reconciled.stripePriceId,
              stripeCustomerId: reconciled.stripeCustomerId,
              stripeSubscriptionId: reconciled.stripeSubscriptionId,
              renewalAt: reconciled.renewalAt || sub.renewalAt,
              updatedAt: new Date().toISOString(),
            });
            const user = d.users.find((item) => item.id === reconciled.userId);
            if (user) {
              user.plan = reconciled.entitled
                ? reconciled.plan
                : "Unsubscribed";
              audit(d, user, "billing.webhook_processed", {
                type: event.type,
                status: reconciled.status,
                entitled: reconciled.entitled,
                mode: PAYMENTS_MODE,
              });
            }
          }
        }
      }
      d.processedWebhooks.push({
        provider: "stripe",
        eventId: event.id,
        processedAt: new Date().toISOString(),
      });
      d.processedWebhooks = d.processedWebhooks.slice(-5000);
      await save(d);
      return send(res, 200, { received: true });
    }
    if (route === "/api/takedowns/webhook" && req.method === "POST") {
      if (!process.env.RESEND_WEBHOOK_SECRET?.startsWith("whsec_"))
        return send(res, 503, { error: "Webhook is not configured." });
      const payload = await raw(req),
        eventId = String(req.headers["svix-id"] || ""),
        headers = {
          "svix-id": eventId,
          "svix-timestamp": String(req.headers["svix-timestamp"] || ""),
          "svix-signature": String(req.headers["svix-signature"] || ""),
        };
      let event;
      try {
        event = new Webhook(process.env.RESEND_WEBHOOK_SECRET).verify(
          payload.toString("utf8"),
          headers,
        );
      } catch {
        return send(res, 400, { error: "Invalid webhook signature." });
      }
      if (!eventId || typeof event !== "object" || !event)
        return send(res, 400, { error: "Invalid webhook event." });
      const d = await load();
      if (
        d.processedWebhooks.some(
          (item) => item.provider === "resend" && item.eventId === eventId,
        )
      )
        return send(res, 200, { received: true, duplicate: true });
      const supported = new Set([
          "email.sent",
          "email.delivered",
          "email.bounced",
          "email.complained",
        ]),
        providerMessageId = String(event.data?.email_id || ""),
        caseRecord = d.cases.find(
          (item) => item.providerMessageId === providerMessageId,
        ),
        eventAt = new Date(event.created_at || Date.now()).toISOString();
      if (caseRecord && supported.has(event.type)) {
        const isNewer =
          !caseRecord.lastProviderEventAt ||
          new Date(eventAt) >= new Date(caseRecord.lastProviderEventAt);
        if (isNewer) {
          caseRecord.deliveryStatus = event.type.replace("email.", "");
          caseRecord.lastProviderEventAt = eventAt;
          caseRecord.updatedAt = new Date().toISOString();
          if (event.type === "email.delivered") {
            caseRecord.status = "Delivered — monitoring";
            caseRecord.deliveredAt = eventAt;
            caseRecord.lastDeliveryError = null;
          } else if (event.type === "email.bounced") {
            caseRecord.status = "Delivery failed";
            caseRecord.lastDeliveryError = "recipient-bounced";
            caseRecord.nextActionAt = null;
          } else if (event.type === "email.complained") {
            caseRecord.status = "Delivery complaint — review required";
            caseRecord.lastDeliveryError = "recipient-complaint";
            caseRecord.nextActionAt = null;
          }
          caseRecord.timeline.push({
            event: `Provider: ${event.type}`,
            details: { provider: "resend", eventId },
            at: eventAt,
          });
          const creator = d.users.find((user) => user.id === caseRecord.userId);
          if (creator)
            audit(d, creator, "case.delivery_status_updated", {
              caseId: caseRecord.id,
              status: caseRecord.deliveryStatus,
            });
        }
      }
      d.processedWebhooks.push({
        provider: "resend",
        eventId,
        processedAt: new Date().toISOString(),
      });
      d.processedWebhooks = d.processedWebhooks.slice(-5000);
      await save(d);
      return send(res, 200, { received: true });
    }
    if (route === "/api/health/live")
      return send(res, 200, {
        ok: true,
        status: "alive",
        uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
      });
    if (
      route === "/api/operations/monitor-heartbeat" &&
      req.method === "POST"
    ) {
      if (!process.env.MONITORING_HEARTBEAT_TOKEN)
        return send(res, 503, {
          error: "Monitoring evidence is not configured.",
        });
      const supplied = String(req.headers.authorization || "").replace(
        /^Bearer\s+/i,
        "",
      );
      if (!monitoringTokenValid(supplied))
        return send(res, 401, { error: "Invalid monitoring credential." });
      if (!(await allowed(req, `monitor-heartbeat:${ip}`, 15, 3600000)).allowed)
        return send(res, 429, { error: "Too many monitoring heartbeats." });
      const body = await parse(req),
        release = String(body.release || "");
      if (
        !/^[a-f0-9]{7,40}$/i.test(release) ||
        body.production !== true ||
        body.seo !== true
      )
        return send(res, 400, {
          error: "Successful production and SEO evidence is required.",
        });
      const evidence = await recordOperationalEvidence({
        type: "monitoring",
        source: "github-actions",
        release,
        details: {
          production: body.production === true,
          seo: body.seo === true,
        },
      });
      return send(res, 202, { recorded: true, evidence });
    }
    if (
      route === "/api/operations/backup-restore-evidence" &&
      req.method === "POST"
    ) {
      if (!process.env.BACKUP_RESTORE_EVIDENCE_TOKEN)
        return send(res, 503, {
          error: "Backup restore evidence is not configured.",
        });
      const supplied = String(req.headers.authorization || "").replace(
        /^Bearer\s+/i,
        "",
      );
      if (
        !secretTokenValid(supplied, process.env.BACKUP_RESTORE_EVIDENCE_TOKEN)
      )
        return send(res, 401, { error: "Invalid restore credential." });
      if (!(await allowed(req, `backup-restore:${ip}`, 6, 3600000)).allowed)
        return send(res, 429, { error: "Too many restore evidence reports." });
      const body = await parse(req),
        snapshotId = String(body.snapshotId || ""),
        manifestKey = String(body.manifestKey || ""),
        sourceIdentity = String(body.sourceIdentity || ""),
        restoreIdentity = String(body.restoreIdentity || ""),
        release = String(body.release || ""),
        tablesChecked = Array.isArray(body.tablesChecked)
          ? [...new Set(body.tablesChecked.map(String))].sort()
          : [],
        requiredTables = BACKUP_TABLES.map((table) => table.name).sort();
      if (
        !/^[A-Za-z0-9._-]{20,120}$/.test(snapshotId) ||
        !/^content-protect-database\/(daily|monthly)\/[A-Za-z0-9._-]{20,120}\/manifest\.json$/.test(
          manifestKey,
        ) ||
        !/^[a-f0-9]{16}$/.test(sourceIdentity) ||
        !/^[a-f0-9]{16}$/.test(restoreIdentity) ||
        sourceIdentity === restoreIdentity ||
        (release && !/^[a-f0-9]{7,40}$/i.test(release)) ||
        JSON.stringify(tablesChecked) !== JSON.stringify(requiredTables)
      )
        return send(res, 400, { error: "Invalid restore evidence." });
      const evidence = await recordOperationalEvidence({
        type: "backup_restore",
        source: "isolated-restore-job",
        release,
        details: {
          snapshotId,
          manifestKey,
          sourceIdentity,
          restoreIdentity,
          tablesChecked,
        },
      });
      return send(res, 202, { recorded: true, evidence });
    }
    if (route === "/api/health/ready" || route === "/api/health") {
      const [databaseResult, storageResult, evidenceResult] =
        await Promise.allSettled([
          databaseProbe(),
          storageProbe(VAULT),
          latestOperationalEvidence(),
        ]);
      const database =
          databaseResult.status === "fulfilled"
            ? databaseResult.value
            : { ok: false, mode: "unavailable" },
        storage =
          storageResult.status === "fulfilled"
            ? storageResult.value
            : { ok: false, mode: "unavailable" },
        operationalEvidence =
          evidenceResult.status === "fulfilled" ? evidenceResult.value : {},
        scanner = scannerMode(),
        readiness = operationsReadiness({
          database,
          storage,
          hasExternalMasterKey: Boolean(process.env.CONTENT_PROTECT_MASTER_KEY),
          scanner,
          takedownDeliveryConfigured: TAKEDOWN_DELIVERY_CONFIGURED,
          takedownsMode: TAKEDOWNS_MODE,
          stripeConfigured: STRIPE_CONFIGURED,
          stripeMode: PAYMENTS_MODE,
          yotiConfigured: YOTI_CONFIGURED,
          yotiMode: YOTI_MODE,
          retentionEvidence: operationalEvidence.retention,
          monitoringEvidence: operationalEvidence.monitoring,
          backupRestoreEvidence: operationalEvidence.backup_restore,
        });
      return send(res, readiness.infrastructureReady ? 200 : 503, {
        ok: readiness.infrastructureReady,
        status: readiness.infrastructureReady ? "ready" : "degraded",
        release: process.env.RENDER_GIT_COMMIT?.slice(0, 12) || "local",
        uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
        storage: storage.mode,
        database: database.mode,
        keyManagement: process.env.CONTENT_PROTECT_MASTER_KEY
          ? "external-secret"
          : "local-key-file",
        checks: { database, storage, operationalEvidence },
        productionReady: readiness.productionReady,
        operationalGates: readiness.operationalGates,
        scanner,
        ageVerification: YOTI_CONFIGURED ? `yoti-${YOTI_MODE}` : "unconfigured",
        emailDelivery: RESEND_EMAIL_CONFIGURED ? "resend" : "unconfigured",
        emailWebhook: RESEND_WEBHOOK_CONFIGURED
          ? "resend-signed"
          : "unconfigured",
        operatorAccess:
          process.env.TAKEDOWN_OPERATOR_TOKEN?.length >= 32
            ? "configured"
            : "unconfigured",
        takedownDelivery: TAKEDOWN_DELIVERY_LIVE
          ? "operator-reviewed-live"
          : TAKEDOWN_DELIVERY_CONFIGURED
            ? "sandbox-locked"
            : "unconfigured",
        legalTemplates: TAKEDOWN_LEGAL_TEMPLATES_APPROVED
          ? `approved-${TAKEDOWN_TEMPLATE_VERSION}`
          : "awaiting-counsel-approval",
        billing: STRIPE_CONFIGURED ? `stripe-${PAYMENTS_MODE}` : "unconfigured",
        retentionAutomation: readiness.operationalGates.retentionAutomation
          ? "configured"
          : "unconfigured",
        monitoring: readiness.operationalGates.monitoring
          ? "configured"
          : "unconfigured",
        backupRestore: readiness.operationalGates.backupRestore
          ? "verified-recently"
          : "unverified-or-expired",
      });
    }
    const d = await load();
    if (route === "/api/operator/session" && req.method === "POST") {
      if (!(await allowed(req, `operator-login:${ip}`, 5, 3600000)).allowed)
        return send(res, 429, {
          error: "Too many operator login attempts. Try again later.",
        });
      const b = await parse(req);
      if (!operatorTokenValid(b.token))
        return send(res, 401, { error: "Invalid operator access token." });
      const rawToken = randomBytes(32).toString("hex"),
        now = new Date().toISOString(),
        expiresAt = new Date(Date.now() + 4 * 3600000).toISOString();
      d.operatorSessions = (d.operatorSessions || []).filter(
        (item) => new Date(item.expiresAt) > new Date(),
      );
      d.operatorSessions.push({
        tokenHash: tokenHash(rawToken),
        expiresAt,
        createdAt: now,
      });
      await save(d);
      return send(
        res,
        200,
        { ok: true, expiresAt },
        {
          "set-cookie": `cp_operator=${rawToken}; HttpOnly; SameSite=Strict; Secure; Path=/api/operator; Max-Age=14400`,
        },
      );
    }
    if (route === "/api/operator/session" && req.method === "DELETE") {
      const currentHash = tokenHash(cookie(req).cp_operator || "");
      d.operatorSessions = (d.operatorSessions || []).filter(
        (item) => item.tokenHash !== currentHash,
      );
      await save(d);
      return send(
        res,
        200,
        { ok: true },
        {
          "set-cookie":
            "cp_operator=; HttpOnly; SameSite=Strict; Secure; Path=/api/operator; Max-Age=0",
        },
      );
    }
    if (route === "/api/operator/me" && req.method === "GET")
      return operatorAuthorised(req, d)
        ? send(res, 200, { operator: true })
        : send(res, 401, { error: "Operator authentication required." });
    if (route === "/api/operator/cases" && req.method === "GET") {
      if (!operatorAuthorised(req, d))
        return send(res, 401, { error: "Operator authentication required." });
      if (!(await allowed(req, `operator-list:${ip}`, 60, 3600000)).allowed)
        return send(res, 429, { error: "Too many operator requests." });
      return send(res, 200, {
        cases: d.cases
          .filter((item) =>
            [
              "Awaiting operator preparation",
              "Approved — delivery pending",
            ].includes(item.status),
          )
          .map((item) => {
            const creator = d.users.find((user) => user.id === item.userId);
            const renderedNotice = creator ? noticeText(item, creator) : null;
            return {
              id: item.id,
              targetUrl: item.targetUrl,
              targetHost: item.targetHost,
              noticeType: item.noticeType,
              evidenceHash: item.evidenceHash,
              noticeText: renderedNotice,
              noticeHash: renderedNotice ? textDigest(renderedNotice) : null,
              templateVersion: item.noticeDraft?.version || null,
              approvedAt: item.approvedAt,
              status: item.status,
              recipientEmail: item.recipientEmail || null,
              recipientSource: item.recipientSource || null,
              jurisdiction: item.jurisdiction || null,
              legalBasis: item.legalBasis || null,
              claimant: creator
                ? { name: creator.name, stageName: creator.stageName || null }
                : null,
            };
          }),
      });
    }
    if (
      route.match(/^\/api\/operator\/cases\/[^/]+\/prepare$/) &&
      req.method === "POST"
    ) {
      if (!operatorAuthorised(req, d))
        return send(res, 401, { error: "Operator authentication required." });
      if (!(await allowed(req, `operator-prepare:${ip}`, 60, 3600000)).allowed)
        return send(res, 429, { error: "Too many operator requests." });
      const caseId = route.split("/")[4],
        b = await parse(req),
        recipientEmail = String(b.recipientEmail || "")
          .trim()
          .toLowerCase(),
        recipientSource = safeHttpsReference(b.recipientSource),
        jurisdiction = String(b.jurisdiction || "")
          .trim()
          .slice(0, 160),
        legalBasis = String(b.legalBasis || "")
          .trim()
          .slice(0, 240),
        caseRecord = d.cases.find((item) => item.id === caseId);
      if (!caseRecord) return send(res, 404, { error: "Case not found." });
      if (caseRecord.status !== "Awaiting operator preparation")
        return send(res, 409, { error: "Case is not awaiting preparation." });
      if (
        !EMAIL.test(recipientEmail) ||
        !recipientSource ||
        jurisdiction.length < 3 ||
        legalBasis.length < 3 ||
        b.confirmRecipientReviewed !== true ||
        b.confirmJurisdictionReviewed !== true
      )
        return send(res, 400, {
          error:
            "Verified recipient, HTTPS source, jurisdiction and legal basis are required.",
        });
      const creator = d.users.find((user) => user.id === caseRecord.userId);
      if (!creator)
        return send(res, 409, { error: "Case claimant no longer exists." });
      caseRecord.recipientEmail = recipientEmail;
      caseRecord.recipientSource = recipientSource;
      caseRecord.jurisdiction = jurisdiction;
      caseRecord.legalBasis = legalBasis;
      caseRecord.status = "Awaiting creator approval";
      caseRecord.preparedAt = new Date().toISOString();
      caseRecord.updatedAt = caseRecord.preparedAt;
      const preparedHash = textDigest(noticeText(caseRecord, creator));
      caseRecord.preparedNoticeHash = preparedHash;
      caseRecord.timeline.push({
        event: "Recipient and notice prepared for creator review",
        details: { noticeHash: preparedHash, recipientSource },
        at: caseRecord.preparedAt,
      });
      audit(d, creator, "case.prepared", { caseId, noticeHash: preparedHash });
      await save(d);
      return send(res, 200, { ok: true, noticeHash: preparedHash });
    }
    if (
      route.match(/^\/api\/operator\/cases\/[^/]+\/dispatch$/) &&
      req.method === "POST"
    ) {
      if (!operatorAuthorised(req, d))
        return send(res, 401, { error: "Operator authentication required." });
      if (!TAKEDOWN_DELIVERY_LIVE)
        return send(res, 503, {
          error:
            "Live delivery is locked until the approved production mode is enabled.",
        });
      if (!(await allowed(req, `operator-send:${ip}`, 30, 86400000)).allowed)
        return send(res, 429, { error: "Daily delivery limit reached." });
      const caseId = route.split("/")[4],
        b = await parse(req),
        caseRecord = d.cases.find((item) => item.id === caseId);
      if (!caseRecord) return send(res, 404, { error: "Case not found." });
      if (caseRecord.status !== "Approved — delivery pending")
        return send(res, 409, { error: "Case is not ready for delivery." });
      if (
        !EMAIL.test(caseRecord.recipientEmail || "") ||
        !safeHttpsReference(caseRecord.recipientSource) ||
        b.confirmJurisdictionReviewed !== true ||
        b.confirmNoticeReviewed !== true
      )
        return send(res, 400, {
          error:
            "Recipient, jurisdiction, notice text and HTTPS source must be reviewed before delivery.",
        });
      const creator = d.users.find((user) => user.id === caseRecord.userId);
      if (!creator)
        return send(res, 409, { error: "Case claimant no longer exists." });
      const renderedNotice = noticeText(caseRecord, creator),
        renderedNoticeHash = textDigest(renderedNotice);
      if (
        !exactNoticeApproved({
          renderedNotice,
          preparedNoticeHash: caseRecord.preparedNoticeHash,
          creatorApprovedNoticeHash:
            caseRecord.declarations?.approvedNoticeHash,
          submittedNoticeHash: b.noticeHash,
        })
      )
        return send(res, 409, {
          error:
            "The approved notice text has changed. Return it to the creator for approval.",
        });
      caseRecord.deliveryAttempts = (caseRecord.deliveryAttempts || 0) + 1;
      caseRecord.reviewedAt = new Date().toISOString();
      caseRecord.updatedAt = caseRecord.reviewedAt;
      try {
        caseRecord.providerMessageId = await deliverNotice(
          caseRecord,
          creator,
          caseRecord.recipientEmail,
        );
      } catch (error) {
        caseRecord.lastDeliveryError = String(error.message).slice(0, 100);
        caseRecord.timeline.push({
          event: "Delivery attempt failed",
          details: { attempt: caseRecord.deliveryAttempts },
          at: caseRecord.updatedAt,
        });
        audit(d, creator, "case.delivery_failed", {
          caseId,
          attempt: caseRecord.deliveryAttempts,
        });
        await save(d);
        return send(res, 502, {
          error: "The delivery provider rejected the request.",
        });
      }
      caseRecord.status = "Submitted — awaiting delivery confirmation";
      caseRecord.mode = "live";
      caseRecord.deliveryStatus = "accepted";
      caseRecord.submittedAt = new Date().toISOString();
      caseRecord.nextActionAt = new Date(
        Date.now() + 7 * 86400000,
      ).toISOString();
      caseRecord.lastDeliveryError = null;
      caseRecord.updatedAt = caseRecord.submittedAt;
      caseRecord.timeline.push({
        event: "Notice accepted by email provider",
        details: {
          provider: "resend",
          recipientSource: caseRecord.recipientSource,
          noticeHash: renderedNoticeHash,
          nextReviewAt: caseRecord.nextActionAt,
        },
        at: caseRecord.submittedAt,
      });
      audit(d, creator, "case.notice_sent", {
        caseId,
        provider: "resend",
        recipientHost: caseRecord.recipientEmail.split("@")[1],
      });
      await save(d);
      return send(res, 200, {
        ok: true,
        caseId,
        status: caseRecord.status,
        submittedAt: caseRecord.submittedAt,
        nextActionAt: caseRecord.nextActionAt,
      });
    }
    if (route === "/api/auth/register" && req.method === "POST") {
      if (!(await allowed(req, `register:${ip}`, 5, 3600000)).allowed)
        return send(
          res,
          429,
          { error: "Too many account creation attempts. Try again later." },
          { "retry-after": "3600" },
        );
      const b = await parse(req),
        email = String(b.email || "")
          .trim()
          .toLowerCase();
      if (!EMAIL.test(email) || !validPassword(b.password))
        return send(res, 400, {
          error:
            "Use a valid email and a password between 10 and 128 characters.",
        });
      if (!b.ageConfirmed || !b.rightsConfirmed || !b.termsAccepted)
        return send(res, 400, {
          error:
            "You must be 18+, control the submitted content, and accept the Terms and Privacy Notice.",
        });
      if (d.users.some((x) => x.email === email))
        return send(res, 409, { error: "Account already exists." });
      const p = pass(b.password),
        now = new Date().toISOString(),
        u = {
          id: randomUUID(),
          name: String(b.name || "Creator")
            .trim()
            .slice(0, 100),
          stageName: String(b.stageName || "")
            .trim()
            .slice(0, 100),
          email,
          salt: p.s,
          passwordHash: p.h,
          plan: "Unsubscribed",
          onboardingComplete: false,
          emailVerifiedAt: null,
          ageVerifiedAt: null,
          eligibilityAcceptedAt: now,
          eligibilityVersion: COMPLIANCE_VERSIONS.eligibility,
          mfaSecretCiphertext: null,
          mfaEnabledAt: null,
          mfaRecoveryHashes: [],
          createdAt: now,
        };
      d.users.push(u);
      const t = newSession(d, u);
      await issueEmailVerification(d, u);
      audit(d, u, "eligibility.accepted", {
        version: u.eligibilityVersion,
        ageConfirmed: true,
        rightsConfirmed: true,
      });
      await save(d);
      return send(
        res,
        201,
        { user: safe(u, d) },
        {
          "set-cookie": `cp_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
        },
      );
    }
    if (route === "/api/auth/login" && req.method === "POST") {
      const b = await parse(req),
        email = String(b.email || "")
          .trim()
          .toLowerCase(),
        ipLimit = await allowed(req, `login-ip:${ip}`, 50, 15 * 60000),
        accountLimit = await allowed(
          req,
          `login-account:${email}`,
          10,
          15 * 60000,
        );
      if (!ipLimit.allowed || !accountLimit.allowed)
        return send(
          res,
          429,
          { error: "Too many login attempts. Try again in 15 minutes." },
          { "retry-after": "900" },
        );
      const u = d.users.find((x) => x.email === email);
      if (!u || typeof b.password !== "string" || b.password.length > 128)
        return send(res, 401, { error: "Email or password is incorrect." });
      const h = scryptSync(b.password, u.salt, 64);
      if (!timingSafeEqual(h, Buffer.from(u.passwordHash, "hex")))
        return send(res, 401, { error: "Email or password is incorrect." });
      let mfaMethod = null;
      if (u.mfaEnabledAt) {
        mfaMethod = consumeMfaCode(u, b.mfaCode);
        if (!mfaMethod)
          return send(res, 401, {
            error: "Enter a valid authenticator or recovery code.",
            mfaRequired: true,
          });
      }
      const t = newSession(d, u);
      audit(d, u, "account.login", {
        mfa: mfaMethod || "not-enabled",
      });
      await save(d);
      return send(
        res,
        200,
        { user: safe(u, d) },
        {
          "set-cookie": `cp_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
        },
      );
    }
    if (route === "/api/auth/logout" && req.method === "POST") {
      d.sessions = d.sessions.filter(
        (x) => x.tokenHash !== tokenHash(cookie(req).cp_session),
      );
      await save(d);
      return send(
        res,
        200,
        { ok: true },
        {
          "set-cookie":
            "cp_session=; HttpOnly; SameSite=Strict; Secure; Path=/; Max-Age=0",
        },
      );
    }
    if (route === "/api/auth/forgot" && req.method === "POST") {
      if (!(await allowed(req, `forgot:${ip}`, 5, 3600000)).allowed)
        return send(
          res,
          429,
          { error: "Too many reset requests. Try again later." },
          { "retry-after": "3600" },
        );
      const b = await parse(req),
        email = String(b.email || "")
          .trim()
          .toLowerCase(),
        u = d.users.find((x) => x.email === email);
      if (u && process.env.RESEND_API_KEY?.startsWith("re_")) {
        const token = randomBytes(32).toString("hex"),
          resetUrl = `${(process.env.APP_URL || "https://content-protect.com").replace(/\/$/, "")}/?reset=${token}`,
          response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              "content-type": "application/json",
              "user-agent": "Content-Protect/1.0",
            },
            body: JSON.stringify({
              from:
                process.env.RESET_FROM_EMAIL ||
                "Content Protect <security@content-protect.com>",
              to: [u.email],
              subject: "Reset your Content Protect password",
              text: `Use this secure link within 30 minutes: ${resetUrl}\n\nIf you did not request this, ignore this email.`,
            }),
          });
        if (response.ok) {
          d.passwordResets = d.passwordResets.filter((x) => x.userId !== u.id);
          d.passwordResets.push({
            tokenHash: tokenHash(token),
            userId: u.id,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          });
          await save(d);
        } else
          console.error(
            "Password reset email provider rejected request",
            response.status,
          );
      }
      return send(res, 200, {
        ok: true,
        notice: "If an account exists, a reset link will be sent.",
      });
    }
    if (route === "/api/auth/reset" && req.method === "POST") {
      if (!(await allowed(req, `reset:${ip}`, 10, 3600000)).allowed)
        return send(
          res,
          429,
          { error: "Too many reset attempts. Try again later." },
          { "retry-after": "3600" },
        );
      const b = await parse(req),
        record = d.passwordResets.find(
          (x) => x.tokenHash === tokenHash(b.token),
        );
      if (!record || !validPassword(b.password))
        return send(res, 400, {
          error:
            "Reset link is invalid or expired, or the password must contain 10 to 128 characters.",
        });
      const u = d.users.find((x) => x.id === record.userId);
      if (!u)
        return send(res, 400, { error: "Reset link is invalid or expired." });
      const p = pass(b.password);
      u.salt = p.s;
      u.passwordHash = p.h;
      d.passwordResets = d.passwordResets.filter((x) => x.userId !== u.id);
      d.sessions = d.sessions.filter((x) => x.userId !== u.id);
      audit(d, u, "account.password_reset");
      await save(d);
      return send(res, 200, { ok: true });
    }
    if (route === "/api/auth/verify-email" && req.method === "POST") {
      if (!(await allowed(req, `verify:${ip}`, 10, 3600000)).allowed)
        return send(res, 429, { error: "Too many verification attempts." });
      const b = await parse(req),
        record = d.emailVerifications.find(
          (x) => x.tokenHash === tokenHash(b.token),
        );
      if (!record)
        return send(res, 400, {
          error: "Verification link is invalid or expired.",
        });
      const account = d.users.find((x) => x.id === record.userId);
      if (!account)
        return send(res, 400, {
          error: "Verification link is invalid or expired.",
        });
      account.emailVerifiedAt = new Date().toISOString();
      d.emailVerifications = d.emailVerifications.filter(
        (x) => x.userId !== account.id,
      );
      audit(d, account, "email.verified");
      await save(d);
      return send(res, 200, { ok: true, user: safe(account, d) });
    }
    const u = userFor(req, d);
    if (!u) return send(res, 401, { error: "Authentication required." });
    if (route === "/api/auth/resend-verification" && req.method === "POST") {
      if (u.emailVerifiedAt) return send(res, 200, { ok: true });
      if (!(await allowed(req, `verify-send:${u.id}`, 3, 3600000)).allowed)
        return send(res, 429, {
          error: "Too many verification emails. Try again later.",
        });
      const sent = await issueEmailVerification(d, u);
      if (sent) await save(d);
      return send(res, 200, {
        ok: true,
        notice:
          "If delivery is available, a new verification link has been sent.",
      });
    }
    if (route === "/api/me") return send(res, 200, { user: safe(u, d) });
    if (route === "/api/verification/age/config" && req.method === "GET") {
      if (!YOTI_CONFIGURED)
        return send(res, 503, {
          error: "Age verification is awaiting provider activation.",
        });
      return send(res, 200, {
        provider: "yoti-digital-identity",
        sdkId: YOTI_CONFIGURATION.sdkId,
        requestedAttribute: "age_over:18",
      });
    }
    if (route === "/api/verification/age/start" && req.method === "POST") {
      if (!u.emailVerifiedAt)
        return send(res, 403, {
          error: "Verify your email before starting age verification.",
        });
      if (u.ageVerifiedAt)
        return send(res, 200, { verified: true, user: safe(u, d) });
      if (!YOTI_CONFIGURED)
        return send(res, 503, {
          error:
            "Age verification is awaiting provider activation. No identity data has been collected.",
        });
      if (!(await allowed(req, `age-start:${u.id}`, 5, 3600000)).allowed)
        return send(res, 429, {
          error: "Too many age verification attempts. Try again later.",
        });
      const base = (
          process.env.APP_URL || "https://content-protect.com"
        ).replace(/\/$/, ""),
        yotiClient = createYotiDigitalIdentityClient(YOTI_CONFIGURATION);
      let session;
      try {
        session = await yotiClient.createShareSession(
          buildYotiAgeShareConfiguration({
            userId: u.id,
            redirectUrl: `${base}/?age_check=return`,
          }),
        );
      } catch (error) {
        console.error("Yoti share session creation failed", error?.name);
        return send(res, 502, {
          error: "The age verification provider is temporarily unavailable.",
        });
      }
      const sessionId = session.getId(),
        expiresAt = session.getExpiry()?.toISOString();
      if (!YOTI_SHARE_ID.test(sessionId || "") || !expiresAt)
        return send(res, 502, {
          error: "The age verification provider returned an invalid session.",
        });
      const now = new Date().toISOString(),
        record = {
          id: randomUUID(),
          userId: u.id,
          kind: "age",
          provider: "yoti-digital-identity",
          providerReference: sessionId,
          status: "pending",
          evidence: { threshold: 18, requestedAttribute: "age_over:18" },
          expiresAt,
          createdAt: now,
          updatedAt: now,
        };
      d.verifications = d.verifications.filter(
        (item) => !(item.userId === u.id && item.kind === "age"),
      );
      d.verifications.push(record);
      audit(d, u, "verification.age_started", {
        provider: "yoti-digital-identity",
        requestedAttribute: "age_over:18",
      });
      await save(d);
      return send(res, 201, {
        provider: "yoti-digital-identity",
        sessionId,
        sdkId: YOTI_CONFIGURATION.sdkId,
        expiresAt,
      });
    }
    if (route === "/api/verification/age/complete" && req.method === "POST") {
      if (!YOTI_CONFIGURED)
        return send(res, 503, {
          error: "Age verification is not configured.",
        });
      const b = await parse(req),
        sessionId = String(b.sessionId || ""),
        submittedReceiptId = String(b.receiptId || "");
      if (
        !YOTI_SHARE_ID.test(sessionId) ||
        (submittedReceiptId && !YOTI_SHARE_ID.test(submittedReceiptId))
      )
        return send(res, 400, { error: "Invalid verification session." });
      const record = d.verifications.find(
        (item) =>
          item.userId === u.id &&
          item.kind === "age" &&
          item.provider === "yoti-digital-identity" &&
          item.providerReference === sessionId,
      );
      if (!record)
        return send(res, 404, { error: "Verification session not found." });
      if (record.status !== "pending")
        return send(res, 409, {
          error: "Verification session is already closed.",
        });
      if (new Date(record.expiresAt) <= new Date()) {
        record.status = "expired";
        record.updatedAt = new Date().toISOString();
        await save(d);
        return send(res, 409, { error: "Verification session has expired." });
      }
      const yotiClient = createYotiDigitalIdentityClient(YOTI_CONFIGURATION);
      let receiptId = submittedReceiptId;
      if (!receiptId) {
        try {
          const shareSession = await yotiClient.getShareSession(sessionId);
          if (shareSession.getId() !== sessionId)
            return send(res, 403, { error: "Verification result mismatch." });
          receiptId = shareSession.getReceiptId() || "";
        } catch (error) {
          console.error("Yoti share session retrieval failed", error?.name);
          return send(res, 502, {
            error: "The verification result is not available yet.",
          });
        }
      }
      if (!YOTI_SHARE_ID.test(receiptId))
        return send(res, 202, {
          verified: false,
          status: "pending",
          error: "Age verification is still processing.",
        });
      if (yotiReceiptAlreadyUsed(d.verifications, receiptId, record.id))
        return send(res, 409, {
          error: "Verification receipt was already used.",
        });
      let receipt;
      try {
        receipt = await yotiClient.getShareReceipt(receiptId);
      } catch (error) {
        console.error("Yoti share receipt retrieval failed", error?.name);
        return send(res, 502, {
          error: "The verification result is not available yet.",
        });
      }
      const interpreted = interpretYotiAgeReceipt(receipt, {
        sessionId,
        receiptId,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
      });
      if (interpreted.status === "mismatch")
        return send(res, 403, { error: "Verification result mismatch." });
      const complete = interpreted.accepted;
      record.status = interpreted.status;
      record.updatedAt = new Date().toISOString();
      record.evidence = {
        method: interpreted.method,
        threshold: interpreted.threshold,
        receiptId,
        receiptTimestamp: interpreted.receiptTimestamp,
      };
      if (complete) {
        u.ageVerifiedAt = record.updatedAt;
        audit(d, u, "verification.age_verified", {
          provider: "yoti-digital-identity",
          method: record.evidence.method,
        });
      }
      await save(d);
      return send(
        res,
        complete ? 200 : record.status === "pending" ? 202 : 409,
        {
          verified: complete,
          status: record.status,
          user: safe(u, d),
          error: complete
            ? undefined
            : record.status === "pending"
              ? "Age verification is still processing."
              : "Age verification was not completed.",
        },
      );
    }
    if (route === "/api/dashboard") {
      const assets = d.assets.filter((x) => x.userId === u.id),
        cases = d.cases.filter((x) => x.userId === u.id),
        scans = d.scans.filter((x) => x.userId === u.id),
        subscription = activeSubscription(d, u.id),
        matches = d.matches
          .filter((m) => m.userId === u.id)
          .map(({ confidence, ...m }) => ({
            ...m,
            matchScore: confidence,
            status: cases.some((c) => c.matchId === m.id)
              ? "Takedown sent"
              : m.status,
          })),
        creatorCases = cases.map((item) => {
          if (item.status !== "Awaiting creator approval") return item;
          const renderedNotice = noticeText(item, u);
          return {
            ...item,
            noticeText: renderedNotice,
            noticeHash: textDigest(renderedNotice),
          };
        });
      return send(res, 200, {
        matches,
        assets,
        cases: creatorCases,
        scans,
        subscription:
          subscription || d.subscriptions.find((x) => x.userId === u.id),
        entitlements: {
          plan: subscription?.plan || "Unsubscribed",
          canScan: Boolean(subscription),
          canCreateCases: ["Protect", "Pro"].includes(subscription?.plan),
          scanFrequency:
            subscription?.plan === "Monitor"
              ? "monthly"
              : subscription
                ? "daily"
                : "unavailable",
        },
        billingMode: STRIPE_CONFIGURED
          ? `stripe_${PAYMENTS_MODE}`
          : "unconfigured",
        scannerMode: scannerMode(),
        audit: d.audit.filter((x) => x.userId === u.id).slice(0, 20),
        stats: {
          matches: matches.length,
          review: matches.filter((x) => x.status === "Action needed").length,
          active: cases.filter((x) => x.status !== "Removed").length,
          removed: matches.filter((x) => x.status === "Removed").length,
          sources: scans[0]?.sourcesChecked || 0,
        },
      });
    }
    if (route === "/api/profile" && req.method === "PATCH") {
      const b = await parse(req);
      u.name = b.name || u.name;
      u.stageName = b.stageName ?? u.stageName;
      u.aliases = Array.isArray(b.aliases)
        ? b.aliases.slice(0, 10)
        : u.aliases || [];
      u.platforms = Array.isArray(b.platforms)
        ? b.platforms.slice(0, 12)
        : u.platforms || [];
      u.onboardingComplete = Boolean(b.onboardingComplete);
      audit(d, u, "profile.updated");
      await save(d);
      return send(res, 200, {
        user: { ...safe(u, d), aliases: u.aliases, platforms: u.platforms },
      });
    }
    if (route === "/api/assets" && req.method === "POST") {
      if (!u.emailVerifiedAt || !u.eligibilityAcceptedAt || !u.ageVerifiedAt)
        return send(res, 403, {
          error:
            "Verify your email, age and eligibility before uploading content.",
        });
      const b = await parse(req),
        raw = Buffer.from(b.data || "", "base64");
      if (!b.name || !b.mime || !raw.length)
        return send(res, 400, { error: "Missing file data." });
      if (b.sensitiveMediaConsent !== true)
        return send(res, 400, {
          error: "Explicit consent to process this reference file is required.",
        });
      if (raw.length > 8e6)
        return send(res, 413, {
          error: "Current upload limit: 8 MB per file.",
        });
      let media;
      try {
        media = await inspectMedia(raw, b.mime);
      } catch (error) {
        if (error instanceof MediaValidationError)
          return send(res, 415, { error: error.message });
        throw error;
      }
      const id = randomUUID(),
        objectKey = `${u.id}/${id}.vault`;
      await putEncryptedObject(objectKey, vault(raw), VAULT);
      const a = {
        id,
        userId: u.id,
        objectKey,
        name: String(b.name).slice(0, 160),
        mime: media.mime,
        mediaFormat: media.format,
        width: media.width || null,
        height: media.height || null,
        size: raw.length,
        checksum: createHash("sha256").update(raw).digest("hex"),
        status: "Protected",
        sensitiveMediaConsentAt: new Date().toISOString(),
        sensitiveMediaConsentVersion: COMPLIANCE_VERSIONS.sensitiveMediaConsent,
        createdAt: new Date().toISOString(),
      };
      d.assets.push(a);
      audit(d, u, "vault.asset_added", {
        assetId: id,
        mime: a.mime,
        declaredMime: media.declaredMime,
        format: media.format,
        width: media.width || null,
        height: media.height || null,
        size: a.size,
        storage: storageMode(),
        consentVersion: a.sensitiveMediaConsentVersion,
      });
      await save(d);
      return send(res, 201, { asset: a });
    }
    if (
      route.match(/^\/api\/assets\/[^/]+\/download$/) &&
      req.method === "POST"
    ) {
      if (!(await allowed(req, `asset-download:${u.id}`, 20, 3600000)).allowed)
        return send(res, 429, {
          error: "Too many download attempts. Try again later.",
        });
      const id = route.split("/")[3],
        asset = d.assets.find((item) => item.id === id && item.userId === u.id),
        b = await parse(req);
      if (!asset) return send(res, 404, { error: "Asset not found." });
      if (!passwordMatches(u, b.password))
        return send(res, 403, { error: "Password is incorrect." });
      const encrypted = await getEncryptedObject(asset.objectKey, VAULT),
        original = unvault(encrypted);
      if (
        createHash("sha256").update(original).digest("hex") !== asset.checksum
      )
        throw new Error("Asset integrity verification failed.");
      audit(d, u, "vault.asset_downloaded", { assetId: asset.id });
      await save(d);
      return sendDownload(
        res,
        original,
        asset.mime || "application/octet-stream",
        attachmentName(asset.name, `${asset.id}.bin`),
      );
    }
    if (route.startsWith("/api/assets/") && req.method === "DELETE") {
      const id = route.split("/").pop(),
        i = d.assets.findIndex((x) => x.id === id && x.userId === u.id);
      if (i < 0) return send(res, 404, { error: "Asset not found." });
      const [asset] = d.assets.splice(i, 1);
      await deleteEncryptedObject(asset.objectKey || `${id}.vault`, VAULT);
      audit(d, u, "vault.asset_deleted", { assetId: id, name: asset.name });
      await save(d);
      return send(res, 200, { ok: true });
    }
    if (route === "/api/scans" && req.method === "POST") {
      if (!u.emailVerifiedAt || !u.eligibilityAcceptedAt || !u.ageVerifiedAt)
        return send(res, 403, {
          error: "Verify your email, age and eligibility before scanning.",
        });
      const subscription = activeSubscription(d, u.id);
      if (!subscription)
        return send(res, 402, {
          error: "An active Content Protect subscription is required to scan.",
        });
      const latestCompletedScan = d.scans
        .filter((item) => item.userId === u.id && item.status === "Completed")
        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0];
      const nextScanAt = latestCompletedScan
        ? new Date(
            new Date(latestCompletedScan.completedAt).getTime() +
              scanIntervalMs(subscription.plan),
          )
        : null;
      if (nextScanAt && nextScanAt > new Date())
        return send(res, 429, {
          error: `${subscription.plan} scanning is available again at ${nextScanAt.toISOString()}.`,
          nextScanAt: nextScanAt.toISOString(),
        });
      const assets = d.assets.filter(
        (x) => x.userId === u.id && x.mime.startsWith("image/"),
      );
      if (!assets.length)
        return send(res, 400, {
          error:
            "Add at least one reference image. Video matching requires a separate provider.",
        });
      if (scannerMode() === "unconfigured")
        return send(res, 503, {
          error:
            "Commercial image scanning is awaiting provider activation. No simulated results were created.",
        });
      const startedAt = new Date().toISOString(),
        scan = {
          id: randomUUID(),
          userId: u.id,
          status: "Running",
          mode: "live",
          provider: "tineye",
          assets: assets.length,
          sourcesChecked: 0,
          matchesFound: 0,
          startedAt,
          completedAt: null,
        },
        ownedHosts = (u.platforms || [])
          .map((value) => {
            try {
              return new URL(value).hostname.toLowerCase();
            } catch {
              return null;
            }
          })
          .filter(Boolean);
      d.scans.unshift(scan);
      try {
        const discovered = [];
        let sourcesChecked = 0;
        for (const asset of assets) {
          const encrypted = await getEncryptedObject(
              asset.objectKey || `${asset.id}.vault`,
              VAULT,
            ),
            result = await searchImage(unvault(encrypted), {
              assetId: asset.id,
              allowedHosts: ownedHosts,
            });
          discovered.push(...result.matches);
          sourcesChecked += Number(result.providerStats?.total_backlinks) || 0;
        }
        for (const found of discovered) {
          const existing = d.matches.find(
            (item) =>
              item.userId === u.id &&
              item.assetId === found.assetId &&
              item.sourceUrl === found.sourceUrl,
          );
          if (existing) {
            existing.confidence = Math.max(
              existing.confidence || 0,
              found.matchScore,
            );
            existing.evidence = found.evidence;
            continue;
          }
          d.matches.push({
            id: randomUUID(),
            scanId: scan.id,
            userId: u.id,
            assetId: found.assetId,
            site: found.sourceHost,
            sourceUrl: found.sourceUrl,
            type: found.mediaType,
            confidence: found.matchScore,
            status: "Action needed",
            age: new Date().toISOString(),
            evidence: found.evidence,
          });
        }
        scan.status = "Completed";
        scan.matchesFound = discovered.length;
        scan.sourcesChecked = sourcesChecked;
        scan.completedAt = new Date().toISOString();
        audit(d, u, "scan.completed", {
          scanId: scan.id,
          mode: "live",
          provider: "tineye",
          assets: assets.length,
          matches: discovered.length,
        });
        await save(d);
        return send(res, 201, {
          scan,
          matches: d.matches.filter((item) => item.userId === u.id),
          notice: `Live image scan complete. ${discovered.length} public occurrences were returned for review.`,
        });
      } catch (error) {
        scan.status = "Failed";
        scan.completedAt = new Date().toISOString();
        audit(d, u, "scan.failed", {
          scanId: scan.id,
          provider: "tineye",
          reason:
            error instanceof ScanProviderError
              ? "provider_error"
              : "internal_error",
        });
        await save(d);
        if (error instanceof ScanProviderError)
          return send(res, error.status, { error: error.message });
        throw error;
      }
    }
    if (route === "/api/billing/checkout" && req.method === "POST") {
      const b = await parse(req);
      if (!STRIPE_PRICES[b.plan])
        return send(res, 400, { error: "Invalid plan." });
      if (
        b.termsAccepted !== true ||
        b.immediateServiceRequested !== true ||
        b.coolingOffAcknowledged !== true
      )
        return send(res, 400, {
          error:
            "Accept the Service Terms and explicitly request immediate service before checkout.",
        });
      if (!u.emailVerifiedAt || !u.ageVerifiedAt)
        return send(res, 403, {
          error: "Verify your email and age before purchasing a plan.",
        });
      if (!STRIPE_CONFIGURED)
        return send(res, 503, {
          error:
            "Billing is not configured. No subscription was created and no payment was taken.",
        });
      const current = d.subscriptions.find((x) => x.userId === u.id);
      if (
        current?.stripeSubscriptionId &&
        ["active", "trialing", "past_due"].includes(current.status)
      )
        return send(res, 409, {
          error:
            "An existing subscription must be managed from the billing portal.",
        });
      const stripe = new Stripe(STRIPE_KEY),
        base = (process.env.APP_URL || "https://content-protect.com").replace(
          /\/$/,
          "",
        ),
        metadata = {
          userId: u.id,
          plan: b.plan,
          priceId: STRIPE_PRICES[b.plan],
          mode: PAYMENTS_MODE,
        },
        session = await stripe.checkout.sessions.create(
          {
            mode: "subscription",
            client_reference_id: u.id,
            ...(current?.stripeCustomerId
              ? { customer: current.stripeCustomerId }
              : { customer_email: u.email }),
            line_items: [{ quantity: 1, price: STRIPE_PRICES[b.plan] }],
            billing_address_collection: "required",
            automatic_tax: {
              enabled: process.env.STRIPE_TAX_ENABLED === "true",
            },
            success_url: `${base}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${base}/?checkout=cancelled`,
            metadata,
            subscription_data: { metadata },
          },
          { idempotencyKey: checkoutIdempotencyKey(u.id, b.plan) },
        );
      const consent = {
        id: randomUUID(),
        userId: u.id,
        plan: b.plan,
        termsVersion: COMPLIANCE_VERSIONS.serviceTerms,
        immediateServiceRequested: true,
        coolingOffAcknowledged: true,
        stripeCheckoutSessionId: session.id,
        createdAt: new Date().toISOString(),
      };
      d.billingConsents.push(consent);
      audit(d, u, "billing.checkout_created", {
        plan: b.plan,
        mode: PAYMENTS_MODE,
        sessionId: session.id,
        consentId: consent.id,
        termsVersion: consent.termsVersion,
      });
      await save(d);
      return send(res, 200, {
        checkoutUrl: session.url,
        mode: `stripe_${PAYMENTS_MODE}`,
      });
    }
    if (route === "/api/billing/session" && req.method === "GET") {
      if (!STRIPE_CONFIGURED)
        return send(res, 503, {
          error: "Stripe billing is not configured.",
        });
      const id = new URL(
        req.url,
        "https://content-protect.com",
      ).searchParams.get("session_id");
      if (!id) return send(res, 400, { error: "Missing checkout session." });
      const stripe = new Stripe(STRIPE_KEY),
        session = await stripe.checkout.sessions.retrieve(id);
      if (session.metadata?.userId !== u.id)
        return send(res, 403, {
          error: "Checkout session does not belong to this account.",
        });
      if (
        Boolean(session.livemode) !== (PAYMENTS_MODE === "live") ||
        session.status !== "complete" ||
        !session.subscription
      )
        return send(res, 409, { error: "Checkout is not complete." });
      const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id,
        stripeSubscription =
          await stripe.subscriptions.retrieve(subscriptionId),
        reconciled = reconcileStripeSubscription(stripeSubscription, {
          prices: STRIPE_PRICES,
          paymentsMode: PAYMENTS_MODE,
          fallbackUserId: u.id,
        });
      if (
        !reconciled.valid ||
        !reconciled.entitled ||
        reconciled.userId !== u.id ||
        session.metadata?.plan !== reconciled.plan ||
        session.metadata?.priceId !== reconciled.stripePriceId
      )
        return send(res, 409, {
          error:
            "The Stripe subscription is not active or its price is invalid.",
        });
      let sub = d.subscriptions.find((x) => x.userId === u.id);
      if (!sub) {
        sub = { id: randomUUID(), userId: u.id };
        d.subscriptions.push(sub);
      }
      Object.assign(sub, {
        plan: reconciled.plan,
        status: reconciled.status,
        mode: `stripe_${PAYMENTS_MODE}`,
        stripeLivemode: reconciled.stripeLivemode,
        stripePriceId: reconciled.stripePriceId,
        stripeCustomerId: reconciled.stripeCustomerId,
        stripeSubscriptionId: reconciled.stripeSubscriptionId,
        renewalAt: reconciled.renewalAt,
        updatedAt: new Date().toISOString(),
      });
      u.plan = reconciled.plan;
      audit(d, u, "billing.checkout_completed", {
        sessionId: id,
        plan: u.plan,
        mode: PAYMENTS_MODE,
      });
      await save(d);
      return send(res, 200, { subscription: sub, user: safe(u, d) });
    }
    if (route === "/api/billing/portal" && req.method === "POST") {
      if (!STRIPE_CONFIGURED)
        return send(res, 503, {
          error: "Stripe billing is not configured.",
        });
      const sub = d.subscriptions.find((x) => x.userId === u.id);
      if (!sub?.stripeCustomerId)
        return send(res, 409, {
          error:
            "Complete a Stripe checkout before opening the billing portal.",
        });
      const stripe = new Stripe(STRIPE_KEY),
        base = (process.env.APP_URL || "https://content-protect.com").replace(
          /\/$/,
          "",
        ),
        session = await stripe.billingPortal.sessions.create({
          customer: sub.stripeCustomerId,
          return_url: `${base}/`,
        });
      audit(d, u, "billing.portal_opened", { mode: PAYMENTS_MODE });
      await save(d);
      return send(res, 200, {
        url: session.url,
        mode: `stripe_${PAYMENTS_MODE}`,
      });
    }
    if (route === "/api/account/mfa/setup" && req.method === "POST") {
      if (u.mfaEnabledAt)
        return send(res, 409, {
          error: "Two-step verification is already enabled.",
        });
      if (!(await allowed(req, `mfa-setup:${u.id}`, 5, 3600000)).allowed)
        return send(res, 429, {
          error: "Too many setup attempts. Try again later.",
        });
      const b = await parse(req);
      if (!passwordMatches(u, b.password))
        return send(res, 403, { error: "Password is incorrect." });
      const secret = base32Encode(randomBytes(20)),
        label = encodeURIComponent(`Content Protect:${u.email}`),
        uri = `otpauth://totp/${label}?secret=${secret}&issuer=Content%20Protect&algorithm=SHA1&digits=6&period=30`;
      audit(d, u, "account.mfa_setup_started");
      await save(d);
      return send(res, 200, {
        secret,
        groupedSecret: secret.match(/.{1,4}/g).join(" "),
        otpauthUri: uri,
      });
    }
    if (route === "/api/account/mfa/enable" && req.method === "POST") {
      if (u.mfaEnabledAt)
        return send(res, 409, {
          error: "Two-step verification is already enabled.",
        });
      if (!(await allowed(req, `mfa-enable:${u.id}`, 10, 3600000)).allowed)
        return send(res, 429, { error: "Too many verification attempts." });
      const b = await parse(req),
        secret = String(b.secret || "")
          .toUpperCase()
          .replace(/[^A-Z2-7]/g, "");
      if (!passwordMatches(u, b.password))
        return send(res, 403, { error: "Password is incorrect." });
      if (secret.length !== 32 || !validTotp(secret, b.code))
        return send(res, 400, {
          error: "The authenticator code or setup secret is invalid.",
        });
      const recoveryCodes = Array.from({ length: 8 }, () => {
        const raw = randomBytes(4).toString("hex").toUpperCase();
        return `${raw.slice(0, 4)}-${raw.slice(4)}`;
      });
      u.mfaSecretCiphertext = vault(Buffer.from(secret)).toString("base64");
      u.mfaEnabledAt = new Date().toISOString();
      u.mfaRecoveryHashes = recoveryCodes.map(recoveryHash);
      d.sessions = d.sessions.filter((item) => item.userId !== u.id);
      const sessionToken = newSession(d, u);
      audit(d, u, "account.mfa_enabled", {
        recoveryCodesIssued: recoveryCodes.length,
      });
      await save(d);
      return send(
        res,
        200,
        { user: safe(u, d), recoveryCodes },
        {
          "set-cookie": `cp_session=${sessionToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
        },
      );
    }
    if (route === "/api/account/mfa" && req.method === "DELETE") {
      if (!u.mfaEnabledAt)
        return send(res, 409, {
          error: "Two-step verification is not enabled.",
        });
      if (!(await allowed(req, `mfa-disable:${u.id}`, 10, 3600000)).allowed)
        return send(res, 429, { error: "Too many verification attempts." });
      const b = await parse(req);
      if (!passwordMatches(u, b.password))
        return send(res, 403, { error: "Password is incorrect." });
      const method = consumeMfaCode(u, b.code);
      if (!method)
        return send(res, 400, {
          error: "Enter a valid authenticator or recovery code.",
        });
      u.mfaSecretCiphertext = null;
      u.mfaEnabledAt = null;
      u.mfaRecoveryHashes = [];
      d.sessions = d.sessions.filter((item) => item.userId !== u.id);
      const sessionToken = newSession(d, u);
      audit(d, u, "account.mfa_disabled", { confirmationMethod: method });
      await save(d);
      return send(
        res,
        200,
        { user: safe(u, d) },
        {
          "set-cookie": `cp_session=${sessionToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
        },
      );
    }
    if (route === "/api/account/password" && req.method === "PATCH") {
      const b = await parse(req);
      if (!passwordMatches(u, b.currentPassword))
        return send(res, 403, { error: "Current password is incorrect." });
      if (!validPassword(b.newPassword))
        return send(res, 400, {
          error: "New password must contain between 10 and 128 characters.",
        });
      const p = pass(b.newPassword);
      u.salt = p.s;
      u.passwordHash = p.h;
      d.sessions = d.sessions.filter((x) => x.userId !== u.id);
      const t = newSession(d, u);
      audit(d, u, "account.password_changed");
      await save(d);
      return send(
        res,
        200,
        { ok: true },
        {
          "set-cookie": `cp_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
        },
      );
    }
    if (route === "/api/account/export" && req.method === "POST") {
      if (!(await allowed(req, `account-export:${u.id}`, 5, 3600000)).allowed)
        return send(res, 429, {
          error: "Too many export attempts. Try again later.",
        });
      const b = await parse(req);
      if (!passwordMatches(u, b.password))
        return send(res, 403, { error: "Password is incorrect." });
      const generatedAt = new Date().toISOString();
      audit(d, u, "account.data_exported", { formatVersion: "1.0" });
      await save(d);
      const exportData = {
        format: "Content Protect personal data export",
        formatVersion: "1.0",
        generatedAt,
        controller: {
          name: "White Eagles Digital Marketing LTD",
          companyNumber: "14978662",
          contact: "white.eagles.dm@gmail.com",
        },
        account: {
          ...safe(u, d),
          aliases: u.aliases || [],
          platforms: u.platforms || [],
        },
        verification: d.verifications
          .filter((item) => item.userId === u.id)
          .map(({ userId, ...item }) => item),
        assets: d.assets
          .filter((item) => item.userId === u.id)
          .map(({ userId, objectKey, ...item }) => item),
        scans: d.scans
          .filter((item) => item.userId === u.id)
          .map(({ userId, ...item }) => item),
        matches: d.matches
          .filter((item) => item.userId === u.id)
          .map(({ userId, ...item }) => item),
        cases: d.cases
          .filter((item) => item.userId === u.id)
          .map(({ userId, ...item }) => item),
        subscriptions: d.subscriptions
          .filter((item) => item.userId === u.id)
          .map(({ userId, ...item }) => item),
        billingConsents: (d.billingConsents || [])
          .filter((item) => item.userId === u.id)
          .map(({ userId, ...item }) => item),
        auditEvents: d.audit
          .filter((item) => item.userId === u.id)
          .map(({ userId, ...item }) => item),
        referenceFiles:
          "Original reference files are downloaded separately from My content so they are not embedded in this JSON export.",
      };
      return sendDownload(
        res,
        Buffer.from(JSON.stringify(exportData, null, 2)),
        "application/json; charset=utf-8",
        `content-protect-data-${generatedAt.slice(0, 10)}.json`,
      );
    }
    if (route === "/api/account" && req.method === "DELETE") {
      const b = await parse(req);
      if (!passwordMatches(u, b.password))
        return send(res, 403, { error: "Password is incorrect." });
      const assets = d.assets.filter((x) => x.userId === u.id);
      const accountingArchived = await archiveAccountingRecords(u.id);
      if (!accountingArchived) {
        d.accountingRecords ||= [];
        const retainedUntil = new Date(
          Date.now() + 6 * 365.25 * 86400000,
        ).toISOString();
        for (const item of [
          ...d.subscriptions.filter((x) => x.userId === u.id),
          ...d.billingConsents.filter((x) => x.userId === u.id),
        ])
          d.accountingRecords.push({
            id: randomUUID(),
            formerUserHash: tokenHash(u.id),
            record: { ...item, userId: undefined },
            retainedUntil,
            createdAt: new Date().toISOString(),
          });
      }
      for (const asset of assets)
        await deleteEncryptedObject(
          asset.objectKey || `${asset.id}.vault`,
          VAULT,
        );
      d.assets = d.assets.filter((x) => x.userId !== u.id);
      d.matches = d.matches.filter((x) => x.userId !== u.id);
      d.cases = d.cases.filter((x) => x.userId !== u.id);
      d.scans = d.scans.filter((x) => x.userId !== u.id);
      d.subscriptions = d.subscriptions.filter((x) => x.userId !== u.id);
      d.billingConsents = (d.billingConsents || []).filter(
        (x) => x.userId !== u.id,
      );
      d.audit = d.audit.filter((x) => x.userId !== u.id);
      d.sessions = d.sessions.filter((x) => x.userId !== u.id);
      d.passwordResets = d.passwordResets.filter((x) => x.userId !== u.id);
      d.emailVerifications = d.emailVerifications.filter(
        (x) => x.userId !== u.id,
      );
      d.verifications = d.verifications.filter((x) => x.userId !== u.id);
      d.users = d.users.filter((x) => x.id !== u.id);
      await save(d);
      return send(
        res,
        200,
        {
          ok: true,
          notice:
            "Account and service data deleted. Minimum billing records remain restricted for the statutory retention period.",
        },
        {
          "set-cookie":
            "cp_session=; HttpOnly; SameSite=Strict; Secure; Path=/; Max-Age=0",
        },
      );
    }
    if (route === "/api/cases" && req.method === "POST") {
      if (!u.emailVerifiedAt || !u.eligibilityAcceptedAt || !u.ageVerifiedAt)
        return send(res, 403, {
          error:
            "Verify your email, age and eligibility before opening a takedown case.",
        });
      const subscription = activeSubscription(d, u.id);
      if (!subscription || !["Protect", "Pro"].includes(subscription.plan))
        return send(res, 402, {
          error:
            "An active Protect or Pro subscription is required to open takedown cases.",
        });
      const b = await parse(req),
        m = d.matches.find((x) => x.id === b.matchId && x.userId === u.id);
      if (!m) return send(res, 404, { error: "Match not found." });
      if (d.cases.some((x) => x.userId === u.id && x.matchId === m.id))
        return send(res, 409, {
          error: "A case already exists for this match.",
        });
      const capturedAt = new Date().toISOString(),
        evidenceSnapshot = {
          version: 2,
          matchId: m.id,
          scanId: m.scanId,
          referenceAssetId: m.assetId,
          sourceUrl: m.sourceUrl,
          sourceHost: m.site,
          mediaType: m.type,
          providerMatchScore: m.confidence,
          discoveredAt: m.age,
          providerEvidence: m.evidence || {},
          capturedAt,
        },
        caseId = randomUUID();
      const c = {
        id: caseId,
        userId: u.id,
        matchId: m.id,
        source: m.site,
        targetUrl: m.sourceUrl,
        targetHost: m.site,
        jurisdiction: "To be determined from recipient",
        noticeType: "copyright",
        status: "Awaiting operator preparation",
        mode: "sandbox",
        evidenceSnapshot,
        evidenceHash: evidenceDigest(evidenceSnapshot),
        noticeDraft: buildCopyrightNotice(u, m, caseId, capturedAt),
        declarations: {},
        createdAt: capturedAt,
        updatedAt: capturedAt,
        timeline: [
          {
            event: "Evidence preserved",
            details: { evidenceHash: evidenceDigest(evidenceSnapshot) },
            at: capturedAt,
          },
          {
            event: "Notice draft prepared",
            details: { noticeVersion: TAKEDOWN_TEMPLATE_VERSION },
            at: capturedAt,
          },
        ],
      };
      d.cases.push(c);
      audit(d, u, "case.created", { caseId: c.id, matchId: m.id });
      await save(d);
      return send(res, 201, {
        case: c,
        notice:
          "Evidence was preserved and a draft was prepared. Nothing has been sent.",
      });
    }
    if (
      route.match(/^\/api\/cases\/[^/]+\/approve$/) &&
      req.method === "POST"
    ) {
      const id = route.split("/")[3],
        c = d.cases.find((x) => x.id === id && x.userId === u.id);
      if (!c) return send(res, 404, { error: "Case not found." });
      if (c.status !== "Awaiting creator approval")
        return send(res, 409, {
          error: "This case has already been reviewed.",
        });
      const b = await parse(req),
        renderedNoticeHash = textDigest(noticeText(c, u));
      if (
        b.noticeHash !== renderedNoticeHash ||
        c.preparedNoticeHash !== renderedNoticeHash
      )
        return send(res, 409, {
          error: "The prepared notice changed and must be reviewed again.",
        });
      if (
        b.rightsHolder !== true ||
        b.goodFaith !== true ||
        b.accurate !== true ||
        b.authoriseDelivery !== true
      )
        return send(res, 400, {
          error:
            "All rights, good-faith, accuracy and delivery declarations are required.",
        });
      c.status = "Approved — delivery pending";
      c.approvedAt = new Date().toISOString();
      c.updatedAt = c.approvedAt;
      c.declarations = {
        rightsHolder: true,
        goodFaith: true,
        accurate: true,
        authoriseDelivery: true,
        acceptedAt: c.approvedAt,
        policyVersion: TAKEDOWN_TEMPLATE_VERSION,
        approvedNoticeHash: renderedNoticeHash,
      };
      c.timeline.push({
        event: "Creator declarations accepted",
        details: {
          policyVersion: TAKEDOWN_TEMPLATE_VERSION,
          approvedNoticeHash: c.declarations.approvedNoticeHash,
        },
        at: c.approvedAt,
      });
      audit(d, u, "case.approved", {
        caseId: id,
        mode: "delivery-pending",
        evidenceHash: c.evidenceHash,
      });
      await save(d);
      return send(res, 200, {
        case: c,
        notice:
          "Approval of the exact notice was recorded. It is queued for final operator review; nothing has been sent yet.",
      });
    }
    send(res, 404, { error: "Not found" });
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "request_failed",
        requestId: res.requestId,
        method: req.method,
        path: req.url.split("?")[0],
        error: e?.message || "unknown",
      }),
    );
    send(res, 500, {
      error:
        e.message === "large" ? "Request too large." : "Something went wrong.",
    });
  }
});

await initializeAuditIntegrity();

appServer.listen(PORT, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      level: "info",
      event: "service_started",
      port: PORT,
      release: process.env.RENDER_GIT_COMMIT?.slice(0, 12) || "local",
    }),
  );
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: "info", event: "shutdown", signal }));
  appServer.close(async () => {
    try {
      await closeDatabase();
      process.exitCode = 0;
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "shutdown_failed",
          error: error?.message || "unknown",
        }),
      );
      process.exitCode = 1;
    }
  });
  setTimeout(() => {
    console.error(
      JSON.stringify({ level: "error", event: "shutdown_timeout" }),
    );
    process.exit(1);
  }, 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
