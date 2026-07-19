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
expect(readyResponse.ok, `readiness returned HTTP ${readyResponse.status}`);
const ready = readyResponse.ok ? await readyResponse.json() : {};
expect(
  ready.ok === true && ready.status === "ready",
  "readiness body is invalid",
);
expect(ready.database === "postgresql", "PostgreSQL is not active");
expect(
    ready.checks?.database?.latestMigration === "013_takedown_exact_approval.sql",
  "latest required database migration is not recorded",
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
    ready.operatorAccess === "configured",
    "operator access is not configured",
  );
  expect(
    ready.legalTemplates?.startsWith("approved-"),
    "takedown templates do not have recorded counsel approval",
  );
  expect(
    ready.ageVerification === "yoti",
    "Yoti age verification is not active",
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
  await response.arrayBuffer();
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, base, failures }, null, 2));
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
