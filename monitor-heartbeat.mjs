const REQUIRED_SECURITY_PAGES = [
  "/",
  "/privacy.html",
  "/terms.html",
  "/cookies.html",
  "/safety.html",
  "/disputes.html",
];

function baseUrl(value) {
  return String(value || "https://content-protect.com").replace(/\/$/, "");
}

async function getJson(fetchImpl, base, path) {
  const response = await fetchImpl(`${base}${path}`, {
    redirect: "error",
    headers: { "user-agent": "Content-Protect-Monitor/1.0" },
  });
  let body = {};
  try {
    body = await response.json();
  } catch {
    // The caller reports the endpoint name, never a response body.
  }
  return { response, body };
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export async function verifyPublicRelease({
  fetchImpl = fetch,
  appUrl,
} = {}) {
  const base = baseUrl(appUrl);
  const { response: liveResponse, body: live } = await getJson(
    fetchImpl,
    base,
    "/api/health/live",
  );
  requireCondition(
    liveResponse.ok && live.ok === true && live.status === "alive",
    "public liveness check failed",
  );

  const { response: readyResponse, body: ready } = await getJson(
    fetchImpl,
    base,
    "/api/health/ready",
  );
  requireCondition(
    readyResponse.ok && ready.ok === true && ready.status === "ready",
    "public readiness check failed",
  );
  requireCondition(ready.database === "postgresql", "PostgreSQL is not active");
  requireCondition(
    ready.storage === "private-object-storage",
    "private object storage is not active",
  );
  requireCondition(
    ready.keyManagement === "external-secret",
    "external master key is not active",
  );
  requireCondition(
    /^[a-f0-9]{12}$/i.test(String(ready.release || "")),
    "release identifier is invalid",
  );

  for (const path of REQUIRED_SECURITY_PAGES) {
    const response = await fetchImpl(`${base}${path}`, {
      redirect: "error",
      headers: { "user-agent": "Content-Protect-Monitor/1.0" },
    });
    requireCondition(response.ok, `${path} is unavailable`);
    requireCondition(
      response.headers.get("strict-transport-security")?.includes("max-age"),
      `${path} is missing HSTS`,
    );
    requireCondition(
      response.headers.get("content-security-policy"),
      `${path} is missing CSP`,
    );
    await response.arrayBuffer();
  }

  const robots = await fetchImpl(`${base}/robots.txt`, {
    redirect: "error",
    headers: { "user-agent": "Content-Protect-Monitor/1.0" },
  });
  requireCondition(robots.ok, "robots.txt is unavailable");
  requireCondition(
    /sitemap:/i.test(await robots.text()),
    "robots.txt has no sitemap reference",
  );
  const sitemap = await fetchImpl(`${base}/sitemap.xml`, {
    redirect: "error",
    headers: { "user-agent": "Content-Protect-Monitor/1.0" },
  });
  requireCondition(sitemap.ok, "sitemap.xml is unavailable");
  requireCondition(/<urlset/i.test(await sitemap.text()), "sitemap is invalid");

  return { base, release: ready.release };
}

export async function recordHeartbeat({
  fetchImpl = fetch,
  appUrl,
  token,
} = {}) {
  requireCondition(
    String(token || "").length >= 32,
    "monitoring credential is not configured",
  );
  const { base, release } = await verifyPublicRelease({ fetchImpl, appUrl });
  const response = await fetchImpl(`${base}/api/operations/monitor-heartbeat`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "Content-Protect-Monitor/1.0",
    },
    body: JSON.stringify({ release, production: true, seo: true }),
  });
  const body = await response.json().catch(() => ({}));
  requireCondition(
    response.status === 202 && body.recorded === true,
    "monitoring heartbeat was not recorded",
  );
  return { release, recorded: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  recordHeartbeat({
    appUrl: process.env.APP_URL,
    token: process.env.MONITORING_HEARTBEAT_TOKEN,
  })
    .then((result) => console.log(JSON.stringify({ ok: true, ...result })))
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error.message }));
      process.exitCode = 1;
    });
}
