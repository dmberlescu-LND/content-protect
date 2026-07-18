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
} from "node:crypto";
import path from "node:path";
import Stripe from "stripe";
import {
  deleteEncryptedObject,
  getEncryptedObject,
  putEncryptedObject,
  storageMode,
} from "./storage.mjs";
import {
  databaseMode,
  loadPostgresState,
  savePostgresState,
} from "./database.mjs";
import { scannerMode, ScanProviderError, searchImage } from "./scanner.mjs";

const PORT = Number(process.env.PORT || 8787),
  ROOT = path.join(process.cwd(), ".traceguard-data"),
  DB = path.join(ROOT, "db.json"),
  VAULT = path.join(ROOT, "vault"),
  KEY_FILE = path.join(ROOT, ".vault-key");
const STRIPE_TEST_KEY = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
  ? process.env.STRIPE_SECRET_KEY
  : null;
const YOTI_CONFIGURED = Boolean(
  process.env.YOTI_API_KEY && process.env.YOTI_SDK_ID,
);
const TAKEDOWN_DELIVERY_CONFIGURED = Boolean(
  process.env.RESEND_API_KEY?.startsWith("re_") &&
    process.env.TAKEDOWN_OPERATOR_TOKEN?.length >= 32,
);
let key;
const rateBuckets = new Map(),
  EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function load() {
  await mkdir(VAULT, { recursive: true });
  if (!key) {
    if (process.env.CONTENT_PROTECT_MASTER_KEY) {
      const secret = process.env.CONTENT_PROTECT_MASTER_KEY;
      key = /^[a-f0-9]{64}$/i.test(secret)
        ? Buffer.from(secret, "hex")
        : createHash("sha256").update(secret).digest();
    } else if (existsSync(KEY_FILE))
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
      legacyState.audit ||= [];
      legacyState.assets ||= [];
      legacyState.cases ||= [];
      legacyState.sessions ||= [];
      legacyState.passwordResets ||= [];
      legacyState.emailVerifications ||= [];
      legacyState.verifications ||= [];
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
      audit: [],
      sessions: [],
      passwordResets: [],
      emailVerifications: [],
      verifications: [],
    };
    await save(d);
    return d;
  }
  const d = JSON.parse(await readFile(DB, "utf8"));
  d.scans ||= [];
  d.subscriptions ||= [];
  d.audit ||= [];
  d.assets ||= [];
  d.cases ||= [];
  d.sessions ||= [];
  d.passwordResets ||= [];
  d.emailVerifications ||= [];
  d.verifications ||= [];
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
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; connect-src 'self'",
};
function send(res, status, data, headers = {}) {
  res.writeHead(status, {
    ...securityHeaders,
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(data));
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
      types = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".ico": "image/x-icon",
      };
    res.writeHead(200, {
      ...securityHeaders,
      "content-type": types[ext] || "application/octet-stream",
      "cache-control":
        ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    });
    res.end(data);
    return true;
  } catch {
    if (!path.extname(rel)) {
      try {
        const data = await readFile(path.join(distRoot, "index.html"));
        res.writeHead(200, {
          ...securityHeaders,
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-cache",
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
function allowed(req, key, max, windowMs) {
  const now = Date.now(),
    bucket = rateBuckets.get(key) || [];
  const fresh = bucket.filter((t) => now - t < windowMs);
  if (fresh.length >= max) return false;
  fresh.push(now);
  rateBuckets.set(key, fresh);
  if (rateBuckets.size > 10000)
    for (const [k, v] of rateBuckets)
      if (!v.some((t) => now - t < windowMs)) rateBuckets.delete(k);
  return true;
}
function validPassword(value, min = 10) {
  return (
    typeof value === "string" && value.length >= min && value.length <= 128
  );
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
function safe(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    stageName: u.stageName,
    aliases: u.aliases || [],
    platforms: u.platforms || [],
    plan: u.plan,
    onboardingComplete: u.onboardingComplete,
    emailVerifiedAt: u.emailVerifiedAt || null,
    ageVerifiedAt: u.ageVerifiedAt || null,
    eligibilityAcceptedAt: u.eligibilityAcceptedAt || null,
    createdAt: u.createdAt,
  };
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
function buildCopyrightNotice(user, match, caseId, capturedAt) {
  return {
    version: "2026-07-18",
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
function operatorAuthorised(req) {
  const supplied = String(req.headers.authorization || "").replace(
      /^Bearer\s+/i,
      "",
    ),
    expected = process.env.TAKEDOWN_OPERATOR_TOKEN || "";
  if (supplied.length < 32 || expected.length < 32) return false;
  const a = createHash("sha256").update(supplied).digest(),
    b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
function noticeText(caseRecord, creator) {
  const displayName = creator.stageName || creator.name;
  return `Copyright removal request

Case reference: ${caseRecord.id}
Claimant: ${displayName}
Unauthorised material: ${caseRecord.targetUrl}
Evidence integrity SHA-256: ${caseRecord.evidenceHash}

The claimant has confirmed that they own or are authorised to represent the rights, have a good-faith belief that the identified use is unauthorised, and that the supplied information is accurate.

Please remove or disable access to the identified material and preserve relevant records in accordance with applicable law and your platform policies.

Please reply to Content Protect Legal quoting the case reference above.

Content Protect is operated by White Eagles Digital Marketing LTD, company number 14978662, England and Wales.`;
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

http
  .createServer(async (req, res) => {
    try {
      if (!req.url.startsWith("/api/")) {
        if (
          process.env.NODE_ENV === "production" &&
          (await staticFile(req, res))
        )
          return;
        return send(res, 404, { error: "Not found" });
      }
      const route = req.url.split("?")[0];
      const ip = clientIp(req),
        origin = req.headers.origin,
        appOrigin = new URL(
          process.env.APP_URL || "https://content-protect.com",
        ).origin;
      if (
        ["POST", "PATCH", "DELETE"].includes(req.method) &&
        route !== "/api/billing/webhook" &&
        origin &&
        origin !== appOrigin &&
        !(
          process.env.NODE_ENV !== "production" &&
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        )
      )
        return send(res, 403, { error: "Invalid request origin." });
      if (route === "/api/billing/webhook" && req.method === "POST") {
        if (!STRIPE_TEST_KEY || !process.env.STRIPE_WEBHOOK_SECRET)
          return send(res, 503, { error: "Webhook is not configured." });
        const stripe = new Stripe(STRIPE_TEST_KEY),
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
        const d = await load();
        if (
          [
            "checkout.session.completed",
            "customer.subscription.updated",
            "customer.subscription.deleted",
          ].includes(event.type)
        ) {
          const o = event.data.object,
            userId = o.metadata?.userId,
            plan = o.metadata?.plan;
          if (userId) {
            let sub = d.subscriptions.find((x) => x.userId === userId);
            if (!sub) {
              sub = { id: randomUUID(), userId };
              d.subscriptions.push(sub);
            }
            Object.assign(sub, {
              plan: plan || sub.plan,
              status:
                event.type === "customer.subscription.deleted"
                  ? "cancelled"
                  : o.status || "active",
              mode: "stripe_test",
              stripeCustomerId:
                typeof o.customer === "string"
                  ? o.customer
                  : sub.stripeCustomerId,
              stripeSubscriptionId:
                typeof o.subscription === "string"
                  ? o.subscription
                  : typeof o.id === "string" && o.object === "subscription"
                    ? o.id
                    : sub.stripeSubscriptionId,
              updatedAt: new Date().toISOString(),
            });
            const user = d.users.find((x) => x.id === userId);
            if (user && plan) user.plan = plan;
            await save(d);
          }
        }
        return send(res, 200, { received: true });
      }
      const d = await load();
      if (route === "/api/health")
        return send(res, 200, {
          ok: true,
          mode: "secure-mvp",
          storage: storageMode(),
          database: databaseMode(),
          scanner: scannerMode(),
          takedownDelivery: TAKEDOWN_DELIVERY_CONFIGURED
            ? "operator-reviewed"
            : "unconfigured",
        });
      if (route === "/api/operator/cases" && req.method === "GET") {
        if (!operatorAuthorised(req))
          return send(res, 401, { error: "Operator authentication required." });
        if (!allowed(req, `operator-list:${ip}`, 60, 3600000))
          return send(res, 429, { error: "Too many operator requests." });
        return send(res, 200, {
          cases: d.cases
            .filter((item) => item.status === "Approved — delivery pending")
            .map((item) => {
              const creator = d.users.find((user) => user.id === item.userId);
              return {
                id: item.id,
                targetUrl: item.targetUrl,
                targetHost: item.targetHost,
                noticeType: item.noticeType,
                evidenceHash: item.evidenceHash,
                approvedAt: item.approvedAt,
                claimant: creator
                  ? { name: creator.name, stageName: creator.stageName || null }
                  : null,
              };
            }),
        });
      }
      if (
        route.match(/^\/api\/operator\/cases\/[^/]+\/dispatch$/) &&
        req.method === "POST"
      ) {
        if (!operatorAuthorised(req))
          return send(res, 401, { error: "Operator authentication required." });
        if (!TAKEDOWN_DELIVERY_CONFIGURED)
          return send(res, 503, { error: "Delivery is not configured." });
        if (!allowed(req, `operator-send:${ip}`, 30, 86400000))
          return send(res, 429, { error: "Daily delivery limit reached." });
        const caseId = route.split("/")[4],
          b = await parse(req),
          recipientEmail = String(b.recipientEmail || "")
            .trim()
            .toLowerCase(),
          recipientSource = String(b.recipientSource || "").trim(),
          caseRecord = d.cases.find((item) => item.id === caseId);
        if (!caseRecord) return send(res, 404, { error: "Case not found." });
        if (caseRecord.status !== "Approved — delivery pending")
          return send(res, 409, { error: "Case is not ready for delivery." });
        if (
          !EMAIL.test(recipientEmail) ||
          !/^https:\/\//i.test(recipientSource) ||
          b.confirmRecipientReviewed !== true
        )
          return send(res, 400, {
            error:
              "A reviewed recipient email, HTTPS source and confirmation are required.",
          });
        const creator = d.users.find(
          (user) => user.id === caseRecord.userId,
        );
        if (!creator)
          return send(res, 409, { error: "Case claimant no longer exists." });
        caseRecord.deliveryAttempts = (caseRecord.deliveryAttempts || 0) + 1;
        caseRecord.recipientEmail = recipientEmail;
        caseRecord.recipientSource = recipientSource;
        caseRecord.reviewedAt = new Date().toISOString();
        caseRecord.updatedAt = caseRecord.reviewedAt;
        try {
          caseRecord.providerMessageId = await deliverNotice(
            caseRecord,
            creator,
            recipientEmail,
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
        caseRecord.status = "Notice sent";
        caseRecord.mode = "live";
        caseRecord.submittedAt = new Date().toISOString();
        caseRecord.nextActionAt = new Date(
          Date.now() + 7 * 86400000,
        ).toISOString();
        caseRecord.lastDeliveryError = null;
        caseRecord.updatedAt = caseRecord.submittedAt;
        caseRecord.timeline.push({
          event: "Notice delivered",
          details: {
            provider: "resend",
            recipientSource,
            nextReviewAt: caseRecord.nextActionAt,
          },
          at: caseRecord.submittedAt,
        });
        audit(d, creator, "case.notice_sent", {
          caseId,
          provider: "resend",
          recipientHost: recipientEmail.split("@")[1],
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
        if (!allowed(req, `register:${ip}`, 5, 3600000))
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
            plan: "Protect",
            onboardingComplete: false,
            emailVerifiedAt: null,
            ageVerifiedAt: null,
            eligibilityAcceptedAt: now,
            eligibilityVersion: "2026-07-18",
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
          { user: safe(u) },
          {
            "set-cookie": `cp_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
          },
        );
      }
      if (route === "/api/auth/login" && req.method === "POST") {
        if (!allowed(req, `login:${ip}`, 10, 15 * 60000))
          return send(
            res,
            429,
            { error: "Too many login attempts. Try again in 15 minutes." },
            { "retry-after": "900" },
          );
        const b = await parse(req),
          email = String(b.email || "")
            .trim()
            .toLowerCase(),
          u = d.users.find((x) => x.email === email);
        if (!u || typeof b.password !== "string" || b.password.length > 128)
          return send(res, 401, { error: "Email or password is incorrect." });
        const h = scryptSync(b.password, u.salt, 64);
        if (!timingSafeEqual(h, Buffer.from(u.passwordHash, "hex")))
          return send(res, 401, { error: "Email or password is incorrect." });
        const t = newSession(d, u);
        await save(d);
        return send(
          res,
          200,
          { user: safe(u) },
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
        if (!allowed(req, `forgot:${ip}`, 5, 3600000))
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
            d.passwordResets = d.passwordResets.filter(
              (x) => x.userId !== u.id,
            );
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
        if (!allowed(req, `reset:${ip}`, 10, 3600000))
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
        if (!allowed(req, `verify:${ip}`, 10, 3600000))
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
        return send(res, 200, { ok: true, user: safe(account) });
      }
      const u = userFor(req, d);
      if (!u) return send(res, 401, { error: "Authentication required." });
      if (route === "/api/auth/resend-verification" && req.method === "POST") {
        if (u.emailVerifiedAt) return send(res, 200, { ok: true });
        if (!allowed(req, `verify-send:${u.id}`, 3, 3600000))
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
      if (route === "/api/me") return send(res, 200, { user: safe(u) });
      if (route === "/api/verification/age/start" && req.method === "POST") {
        if (!u.emailVerifiedAt)
          return send(res, 403, {
            error: "Verify your email before starting age verification.",
          });
        if (u.ageVerifiedAt)
          return send(res, 200, { verified: true, user: safe(u) });
        if (!YOTI_CONFIGURED)
          return send(res, 503, {
            error:
              "Age verification is awaiting provider activation. No identity data has been collected.",
          });
        const base = (
            process.env.APP_URL || "https://content-protect.com"
          ).replace(/\/$/, ""),
          response = await fetch("https://age.yoti.com/api/v1/sessions", {
            method: "POST",
            headers: {
              authorization: `Bearer ${process.env.YOTI_API_KEY}`,
              "content-type": "application/json",
              "yoti-sdk-id": process.env.YOTI_SDK_ID,
              "user-agent": "Content-Protect/1.0",
            },
            body: JSON.stringify({
              type: "OVER",
              ttl: 900,
              reference_id: u.id,
              digital_id: {
                allowed: true,
                threshold: 18,
                age_estimation_allowed: true,
                age_estimation_threshold: 21,
                retry_limit: 2,
              },
              doc_scan: {
                allowed: true,
                threshold: 18,
                authenticity: "AUTO",
                level: "PASSIVE",
                retry_limit: 2,
              },
              age_estimation: {
                allowed: true,
                threshold: 21,
                level: "PASSIVE",
                retry_limit: 2,
              },
              callback: { auto: true, url: `${base}/?age_check=return` },
              cancel_url: `${base}/?age_check=cancelled`,
              retry_enabled: true,
              resume_enabled: true,
              synchronous_checks: true,
            }),
          });
        if (!response.ok) {
          console.error("Yoti session creation failed", response.status);
          return send(res, 502, {
            error: "The age verification provider is temporarily unavailable.",
          });
        }
        const session = await response.json(),
          now = new Date().toISOString(),
          record = {
            id: randomUUID(),
            userId: u.id,
            kind: "age",
            provider: "yoti",
            providerReference: session.id,
            status: "pending",
            evidence: {},
            expiresAt: session.expires_at,
            createdAt: now,
            updatedAt: now,
          };
        d.verifications = d.verifications.filter(
          (item) => !(item.userId === u.id && item.kind === "age"),
        );
        d.verifications.push(record);
        audit(d, u, "verification.age_started", { provider: "yoti" });
        await save(d);
        return send(res, 201, {
          verificationUrl: `https://age.yoti.com?sessionId=${encodeURIComponent(session.id)}&sdkId=${encodeURIComponent(process.env.YOTI_SDK_ID)}`,
          expiresAt: session.expires_at,
        });
      }
      if (route === "/api/verification/age/complete" && req.method === "POST") {
        if (!YOTI_CONFIGURED)
          return send(res, 503, {
            error: "Age verification is not configured.",
          });
        const b = await parse(req),
          sessionId = String(b.sessionId || "");
        if (!/^[0-9a-f-]{36}$/i.test(sessionId))
          return send(res, 400, { error: "Invalid verification session." });
        const record = d.verifications.find(
          (item) =>
            item.userId === u.id &&
            item.kind === "age" &&
            item.provider === "yoti" &&
            item.providerReference === sessionId,
        );
        if (!record)
          return send(res, 404, { error: "Verification session not found." });
        const response = await fetch(
          `https://age.yoti.com/api/v1/sessions/${encodeURIComponent(sessionId)}/result`,
          {
            headers: {
              authorization: `Bearer ${process.env.YOTI_API_KEY}`,
              "yoti-sdk-id": process.env.YOTI_SDK_ID,
              "user-agent": "Content-Protect/1.0",
            },
          },
        );
        if (!response.ok)
          return send(res, 502, {
            error: "The verification result is not available yet.",
          });
        const result = await response.json();
        if (result.id !== sessionId || result.reference_id !== u.id)
          return send(res, 403, { error: "Verification result mismatch." });
        const complete = result.status === "COMPLETE" && result.age >= 18;
        record.status = complete
          ? "verified"
          : result.status === "EXPIRED"
            ? "expired"
            : result.status === "PENDING" || result.status === "IN_PROGRESS"
              ? "pending"
              : "failed";
        record.updatedAt = new Date().toISOString();
        record.evidence = {
          method: result.method || "unknown",
          status: result.status,
          evidenceId: result.evidence_id || null,
        };
        if (complete) {
          u.ageVerifiedAt = record.updatedAt;
          audit(d, u, "verification.age_verified", {
            provider: "yoti",
            method: record.evidence.method,
          });
        }
        await save(d);
        return send(res, complete ? 200 : 409, {
          verified: complete,
          status: record.status,
          user: safe(u),
          error: complete ? undefined : "Age verification was not completed.",
        });
      }
      if (route === "/api/dashboard") {
        const assets = d.assets.filter((x) => x.userId === u.id),
          cases = d.cases.filter((x) => x.userId === u.id),
          scans = d.scans.filter((x) => x.userId === u.id),
          matches = d.matches
            .filter((m) => m.userId === u.id)
            .map((m) => ({
              ...m,
              status: cases.some((c) => c.matchId === m.id)
                ? "Takedown sent"
                : m.status,
            }));
        return send(res, 200, {
          matches,
          assets,
          cases,
          scans,
          subscription: d.subscriptions.find((x) => x.userId === u.id),
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
          user: { ...safe(u), aliases: u.aliases, platforms: u.platforms },
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
        if (raw.length > 8e6)
          return send(res, 413, {
            error: "Current upload limit: 8 MB per file.",
          });
        if (!/^(image|video)\/[a-z0-9.+-]+$/i.test(String(b.mime)))
          return send(res, 415, {
            error: "Only supported image and video files are accepted.",
          });
        const id = randomUUID(),
          objectKey = `${u.id}/${id}.vault`;
        await putEncryptedObject(objectKey, vault(raw), VAULT);
        const a = {
          id,
          userId: u.id,
          objectKey,
          name: String(b.name).slice(0, 160),
          mime: String(b.mime).slice(0, 80),
          size: raw.length,
          checksum: createHash("sha256").update(raw).digest("hex"),
          status: "Protected",
          createdAt: new Date().toISOString(),
        };
        d.assets.push(a);
        audit(d, u, "vault.asset_added", {
          assetId: id,
          mime: a.mime,
          size: a.size,
          storage: storageMode(),
        });
        await save(d);
        return send(res, 201, { asset: a });
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
                found.confidence,
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
              confidence: found.confidence,
              status: "Action needed",
              age: new Date().toISOString(),
              evidence: found.evidence,
            });
          }
          scan.status = "Completed";
          scan.matchesFound = discovered.length;
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
        const b = await parse(req),
          prices = { Monitor: 1900, Protect: 4900, Pro: 9900 };
        if (!prices[b.plan]) return send(res, 400, { error: "Invalid plan." });
        if (STRIPE_TEST_KEY) {
          const stripe = new Stripe(STRIPE_TEST_KEY),
            base = (
              process.env.APP_URL || "https://content-protect.com"
            ).replace(/\/$/, "");
          const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer_email: u.email,
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: "gbp",
                  unit_amount: prices[b.plan],
                  recurring: { interval: "month" },
                  product_data: {
                    name: `Content Protect ${b.plan}`,
                    description:
                      "Creator protection subscription — Stripe test mode",
                  },
                },
              },
            ],
            success_url: `${base}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${base}/?checkout=cancelled`,
            metadata: { userId: u.id, plan: b.plan, mode: "sandbox" },
            subscription_data: {
              metadata: { userId: u.id, plan: b.plan, mode: "sandbox" },
            },
          });
          audit(d, u, "billing.test_checkout_created", {
            plan: b.plan,
            sessionId: session.id,
          });
          await save(d);
          return send(res, 200, {
            checkoutUrl: session.url,
            mode: "stripe_test",
          });
        }
        let sub = d.subscriptions.find((x) => x.userId === u.id);
        if (!sub) {
          sub = { id: randomUUID(), userId: u.id };
          d.subscriptions.push(sub);
        }
        Object.assign(sub, {
          plan: b.plan,
          status: "test_active",
          mode: "sandbox",
          renewalAt: null,
          updatedAt: new Date().toISOString(),
        });
        u.plan = b.plan;
        audit(d, u, "billing.test_plan_selected", { plan: b.plan });
        await save(d);
        return send(res, 200, {
          subscription: sub,
          user: safe(u),
          notice:
            "Stripe test key is not configured yet. The plan was simulated and no payment was taken.",
        });
      }
      if (route === "/api/billing/session" && req.method === "GET") {
        if (!STRIPE_TEST_KEY)
          return send(res, 503, {
            error: "Stripe test mode is not configured.",
          });
        const id = new URL(
          req.url,
          "https://content-protect.com",
        ).searchParams.get("session_id");
        if (!id) return send(res, 400, { error: "Missing checkout session." });
        const stripe = new Stripe(STRIPE_TEST_KEY),
          session = await stripe.checkout.sessions.retrieve(id);
        if (session.metadata?.userId !== u.id)
          return send(res, 403, {
            error: "Checkout session does not belong to this account.",
          });
        if (session.payment_status !== "paid")
          return send(res, 409, { error: "Checkout is not complete." });
        let sub = d.subscriptions.find((x) => x.userId === u.id);
        if (!sub) {
          sub = { id: randomUUID(), userId: u.id };
          d.subscriptions.push(sub);
        }
        Object.assign(sub, {
          plan: session.metadata.plan,
          status: "active",
          mode: "stripe_test",
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          updatedAt: new Date().toISOString(),
        });
        u.plan = session.metadata.plan;
        audit(d, u, "billing.test_checkout_completed", {
          sessionId: id,
          plan: u.plan,
        });
        await save(d);
        return send(res, 200, { subscription: sub, user: safe(u) });
      }
      if (route === "/api/billing/portal" && req.method === "POST") {
        if (!STRIPE_TEST_KEY)
          return send(res, 503, {
            error: "Stripe test mode is not configured.",
          });
        const sub = d.subscriptions.find((x) => x.userId === u.id);
        if (!sub?.stripeCustomerId)
          return send(res, 409, {
            error:
              "Complete a Stripe test checkout before opening the billing portal.",
          });
        const stripe = new Stripe(STRIPE_TEST_KEY),
          base = (process.env.APP_URL || "https://content-protect.com").replace(
            /\/$/,
            "",
          ),
          session = await stripe.billingPortal.sessions.create({
            customer: sub.stripeCustomerId,
            return_url: `${base}/`,
          });
        audit(d, u, "billing.portal_opened", { mode: "stripe_test" });
        await save(d);
        return send(res, 200, { url: session.url, mode: "stripe_test" });
      }
      if (route === "/api/account/password" && req.method === "PATCH") {
        const b = await parse(req),
          current = scryptSync(b.currentPassword || "", u.salt, 64);
        if (!timingSafeEqual(current, Buffer.from(u.passwordHash, "hex")))
          return send(res, 403, { error: "Current password is incorrect." });
        if (!b.newPassword || b.newPassword.length < 10)
          return send(res, 400, {
            error: "New password must contain at least 10 characters.",
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
      if (route === "/api/account" && req.method === "DELETE") {
        const b = await parse(req),
          current = scryptSync(b.password || "", u.salt, 64);
        if (!timingSafeEqual(current, Buffer.from(u.passwordHash, "hex")))
          return send(res, 403, { error: "Password is incorrect." });
        const assets = d.assets.filter((x) => x.userId === u.id);
        for (const asset of assets)
          await deleteEncryptedObject(
            asset.objectKey || `${asset.id}.vault`,
            VAULT,
          );
        d.assets = d.assets.filter((x) => x.userId !== u.id);
        d.cases = d.cases.filter((x) => x.userId !== u.id);
        d.scans = d.scans.filter((x) => x.userId !== u.id);
        d.subscriptions = d.subscriptions.filter((x) => x.userId !== u.id);
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
          { ok: true },
          {
            "set-cookie":
              "cp_session=; HttpOnly; SameSite=Strict; Secure; Path=/; Max-Age=0",
          },
        );
      }
      if (route === "/api/cases" && req.method === "POST") {
        const b = await parse(req),
          m = d.matches.find((x) => x.id === b.matchId && x.userId === u.id);
        if (!m) return send(res, 404, { error: "Match not found." });
        if (d.cases.some((x) => x.userId === u.id && x.matchId === m.id))
          return send(res, 409, {
            error: "A case already exists for this match.",
          });
        const capturedAt = new Date().toISOString(),
          evidenceSnapshot = {
            version: 1,
            matchId: m.id,
            scanId: m.scanId,
            referenceAssetId: m.assetId,
            sourceUrl: m.sourceUrl,
            sourceHost: m.site,
            mediaType: m.type,
            providerConfidence: m.confidence,
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
          status: "Awaiting declarations",
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
              details: { noticeVersion: "2026-07-18" },
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
        if (c.status !== "Awaiting declarations")
          return send(res, 409, {
            error: "This case has already been reviewed.",
          });
        const b = await parse(req);
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
          policyVersion: "2026-07-18",
        };
        c.timeline.push({
          event: "Creator declarations accepted",
          details: { policyVersion: "2026-07-18" },
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
            "Approval and declarations recorded. No external notice was sent because the delivery service is not configured yet.",
        });
      }
      send(res, 404, { error: "Not found" });
    } catch (e) {
      console.error(e);
      send(res, 500, {
        error:
          e.message === "large"
            ? "Request too large."
            : "Something went wrong.",
      });
    }
  })
  .listen(PORT, "0.0.0.0", () =>
    console.log(`Content Protect API ready on port ${PORT}`),
  );
