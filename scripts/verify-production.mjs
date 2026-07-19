import { REQUIRED_MIGRATION } from "../operations-readiness.mjs";

const base = (process.env.APP_URL || "https://content-protect.com").replace(
  /\/$/,
  "",
);
const requireProductionReady = process.env.REQUIRE_PRODUCTION_READY === "true";
const failures = [];

async function request(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(`${base}${path}`, {
      redirect: "error",
      signal: controller.signal,
      headers: { "user-agent": "Content-Protect-Production-Verifier/1.0" },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const liveResponse = await request("/api/health/live");
expect(liveResponse.ok, `liveness returned HTTP ${liveResponse.status}`);
const live = liveResponse.ok ? await liveResponse.json() : {};
expect(live.ok === true && live.status === "alive", "liveness body is invalid");

const readyResponse = await request("/api/health/ready");
let ready = {};
try {
  ready = await readyResponse.json();
} catch {
  failures.push("readiness did not return JSON");
}
expect(
  readyResponse.status === 200 || readyResponse.status === 503,
  `readiness returned unexpected HTTP ${readyResponse.status}`,
);
expect(readyResponse.ok, `readiness returned HTTP ${readyResponse.status}`);
expect(
  ready.ok === true && ready.status === "ready",
  "readiness body is invalid",
);
expect(ready.database === "postgresql", "PostgreSQL is not active");
expect(
  ready.checks?.database?.latestMigration === REQUIRED_MIGRATION,
  "latest required database migration is not recorded",
);
expect(
  ready.checks?.storage?.mode === "private-object-storage",
  "private object storage is not active",
);
expect(
  ready.keyManagement === "external-secret",
  "external master key is not active",
);
if (requireProductionReady) {
  expect(
    ready.productionReady === true,
    "production release gate is not green",
  );
  expect(
    ready.emailDelivery === "resend",
    "Resend email delivery is not active",
  );
  expect(
    ready.emailWebhook === "resend-signed",
    "signed Resend webhook is not active",
  );
  expect(
    ready.operatorAccess === "token-totp-step-up",
    "operator token, identity and MFA step-up are not configured",
  );
  expect(
    ready.legalTemplates?.startsWith("approved-"),
    "takedown templates do not have recorded counsel approval",
  );
  expect(
    ready.ageVerification === "yoti-live",
    "live Yoti age verification is not active",
  );
  expect(
    ready.retentionAutomation === "configured",
    "approved retention automation is not active",
  );
  expect(
    ready.monitoring === "configured",
    "external monitoring is not active",
  );
  expect(
    ready.backupRestore === "verified-recently",
    "database restore evidence is missing or older than 100 days",
  );
  expect(
    ready.auditExport === "verified-recently",
    "independent retained audit export evidence is missing or older than 36 hours",
  );
  expect(
    ready.launchGovernance?.status === "approved" &&
      ready.operationalGates?.launchGovernance === true,
    "signed UK launch governance approval is missing, invalid or expired",
  );
  expect(ready.scanner !== "unconfigured", "scanner is not configured");
  expect(
    ready.takedownDelivery === "operator-reviewed-live",
    "live takedown delivery is not active",
  );
  expect(ready.billing === "stripe-live", "live Stripe is not configured");
}

for (const page of [
  "/",
  "/privacy.html",
  "/terms.html",
  "/cookies.html",
  "/safety.html",
  "/disputes.html",
]) {
  const response = await request(page);
  expect(response.ok, `${page} returned HTTP ${response.status}`);
  expect(
    response.headers.get("strict-transport-security")?.includes("max-age"),
    `${page} is missing HSTS`,
  );
  expect(
    response.headers.get("x-content-type-options") === "nosniff",
    `${page} is missing nosniff`,
  );
  expect(
    Boolean(response.headers.get("content-security-policy")),
    `${page} is missing CSP`,
  );
  expect(
    response.headers.get("referrer-policy") ===
      "strict-origin-when-cross-origin",
    `${page} has an unsafe or missing Referrer-Policy`,
  );
  expect(
    response.headers.get("permissions-policy")?.includes("camera=()"),
    `${page} is missing the restrictive Permissions-Policy`,
  );
  expect(
    response.headers.get("cross-origin-opener-policy") === "same-origin",
    `${page} is missing Cross-Origin-Opener-Policy`,
  );
  expect(
    response.headers.get("x-frame-options") === "DENY",
    `${page} is not protected against framing`,
  );
  await response.arrayBuffer();
}

if (failures.length) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        base,
        readinessHttpStatus: readyResponse.status,
        release: ready.release,
        productionReady: ready.productionReady,
        operationalGates: ready.operationalGates,
        failures,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        ok: true,
        base,
        release: ready.release,
        productionReady: ready.productionReady,
        checks: ready.checks,
      },
      null,
      2,
    ),
  );
}
