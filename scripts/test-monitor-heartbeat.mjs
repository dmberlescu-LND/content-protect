import assert from "node:assert/strict";
import { recordHeartbeat } from "../monitor-heartbeat.mjs";

const securityHeaders = new Headers({
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "content-security-policy": "default-src 'self'",
});
const json = (body, status = 200, headers = securityHeaders) =>
  new Response(JSON.stringify(body), { status, headers });
const text = (body, status = 200, headers = securityHeaders) =>
  new Response(body, { status, headers });

function healthyFetch(calls) {
  return async (url, options = {}) => {
    calls.push({ url, options });
    const path = new URL(url).pathname;
    if (path === "/api/health/live")
      return json({ ok: true, status: "alive" });
    if (path === "/api/health/ready")
      return json({
        ok: true,
        status: "ready",
        database: "postgresql",
        storage: "private-object-storage",
        keyManagement: "external-secret",
        release: "abcdef123456",
      });
    if (path === "/robots.txt") return text("Sitemap: https://example.test/sitemap.xml");
    if (path === "/sitemap.xml") return text("<urlset></urlset>");
    if (path === "/api/operations/monitor-heartbeat")
      return json({ recorded: true }, 202);
    return text("ok");
  };
}

const calls = [];
assert.deepEqual(
  await recordHeartbeat({
    fetchImpl: healthyFetch(calls),
    appUrl: "https://example.test",
    token: "x".repeat(32),
  }),
  { release: "abcdef123456", recorded: true },
);
const heartbeat = calls.at(-1);
assert.equal(new URL(heartbeat.url).pathname, "/api/operations/monitor-heartbeat");
assert.equal(heartbeat.options.method, "POST");
assert.deepEqual(JSON.parse(heartbeat.options.body), {
  release: "abcdef123456",
  production: true,
  seo: true,
});

const noPostCalls = [];
await assert.rejects(
  () =>
    recordHeartbeat({
      fetchImpl: async (url, options) => {
        noPostCalls.push({ url, options });
        if (new URL(url).pathname === "/api/health/live")
          return json({ ok: false, status: "down" }, 503);
        return healthyFetch([])(url, options);
      },
      appUrl: "https://example.test",
      token: "x".repeat(32),
    }),
  /public liveness check failed/,
);
assert.equal(
  noPostCalls.some(
    (call) => new URL(call.url).pathname === "/api/operations/monitor-heartbeat",
  ),
  false,
);

await assert.rejects(
  () => recordHeartbeat({ fetchImpl: healthyFetch([]), token: "short" }),
  /monitoring credential is not configured/,
);

console.log(
  JSON.stringify({
    ok: true,
    publicChecksRequiredBeforeHeartbeat: true,
    failedChecksNeverRecordHeartbeat: true,
    credentialRequired: true,
  }),
);
