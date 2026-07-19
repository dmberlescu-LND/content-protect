import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { totpAt } from "../totp.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  dataDirectory = await mkdtemp(
    join(tmpdir(), "content-protect-operator-test-"),
  ),
  port = 19000 + (process.pid % 1000),
  origin = `http://127.0.0.1:${port}`,
  token = "operator-test-token-" + "x".repeat(40),
  secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
  childEnvironment = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "test",
    CONTENT_PROTECT_DATA_DIR: dataDirectory,
    CONTENT_PROTECT_MASTER_KEY:
      "operator-integration-master-key-" + "m".repeat(40),
    TAKEDOWN_OPERATOR_ID: "test-director-01",
    TAKEDOWN_OPERATOR_TOKEN: token,
    TAKEDOWN_OPERATOR_TOTP_SECRET: secret,
  };

for (const key of [
  "DATABASE_URL",
  "OBJECT_STORAGE_ENDPOINT",
  "OBJECT_STORAGE_BUCKET",
  "OBJECT_STORAGE_ACCESS_KEY_ID",
  "OBJECT_STORAGE_SECRET_ACCESS_KEY",
])
  delete childEnvironment[key];

const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: childEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  }),
  logs = [];
child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
child.stderr.on("data", (chunk) => logs.push(chunk.toString()));

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/health/live`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Operator test server did not start. ${logs.join("")}`);
}

async function login(body) {
  return fetch(`${origin}/api/operator/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

try {
  await waitForServer();
  assert.equal((await login({ token })).status, 401);
  assert.equal((await login({ token, mfaCode: "000000" })).status, 401);

  const code = totpAt(secret),
    authenticated = await login({ token, mfaCode: code });
  assert.equal(authenticated.status, 200);
  const loginResult = await authenticated.json(),
    setCookie = authenticated.headers.get("set-cookie") || "",
    cookie = setCookie.split(";")[0];
  assert.equal(loginResult.operatorId, "test-director-01");
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /SameSite=Strict/i);
  assert.match(setCookie, /Max-Age=3600/i);

  const bearerBypass = await fetch(`${origin}/api/operator/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(bearerBypass.status, 401);

  const sessionCheck = await fetch(`${origin}/api/operator/me`, {
    headers: { cookie },
  });
  assert.equal(sessionCheck.status, 200);
  assert.equal((await sessionCheck.json()).operatorId, "test-director-01");
  assert.equal((await login({ token, mfaCode: code })).status, 409);

  const logout = await fetch(`${origin}/api/operator/session`, {
    method: "DELETE",
    headers: { cookie, origin },
  });
  assert.equal(logout.status, 200);
  assert.equal(
    (
      await fetch(`${origin}/api/operator/me`, {
        headers: { cookie },
      })
    ).status,
    401,
  );

  console.log(
    JSON.stringify({
      ok: true,
      tokenOnlyRejected: true,
      totpRequired: true,
      totpReplayRejected: true,
      bearerBypassRejected: true,
      oneHourSecureSession: true,
    }),
  );
} finally {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
  await rm(dataDirectory, { recursive: true, force: true });
}
