import assert from "node:assert/strict";
import { createHash, scryptSync } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  dataDirectory = await mkdtemp(join(tmpdir(), "content-protect-yoti-test-")),
  basePort = 22000 + (process.pid % 1000),
  approvedUserId = "11111111-1111-4111-8111-111111111111",
  deniedUserId = "22222222-2222-4222-8222-222222222222",
  approvedSession = "approved-yoti-sandbox-session-token",
  deniedSession = "denied-yoti-sandbox-session-token",
  approvedEmail = "creator+approved@example.test",
  password = "secure-test-password",
  salt = "33".repeat(16),
  now = "2026-07-19T22:00:00.000Z",
  baseEnvironment = {
    ...process.env,
    NODE_ENV: "test",
    CONTENT_PROTECT_DATA_DIR: dataDirectory,
    CONTENT_PROTECT_MASTER_KEY:
      "yoti-sandbox-integration-master-key-" + "q".repeat(40),
    YOTI_SANDBOX_TEST_EMAILS: approvedEmail,
    YOTI_SANDBOX_TEST_APPROVAL_REFERENCE: "owner-approval-2026-07-19",
  };

for (const key of [
  "DATABASE_URL",
  "OBJECT_STORAGE_ENDPOINT",
  "OBJECT_STORAGE_BUCKET",
  "OBJECT_STORAGE_ACCESS_KEY_ID",
  "OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "YOTI_SDK_ID",
  "YOTI_PRIVATE_KEY",
])
  delete baseEnvironment[key];

const makeUser = (id, email) => ({
  id,
  email,
  name: "Sandbox Test Creator",
  stageName: "Sandbox Creator",
  salt,
  passwordHash: scryptSync(password, salt, 64).toString("hex"),
  plan: "Unsubscribed",
  onboardingComplete: true,
  emailVerifiedAt: now,
  ageVerifiedAt: null,
  eligibilityAcceptedAt: now,
  eligibilityVersion: "2026-07-18-v1",
  aliases: [],
  platforms: [],
  createdAt: now,
});

await writeFile(
  join(dataDirectory, "db.json"),
  JSON.stringify({
    users: [
      makeUser(approvedUserId, approvedEmail),
      makeUser(deniedUserId, "creator+denied@example.test"),
    ],
    assets: [],
    matches: [],
    scans: [],
    subscriptions: [],
    billingConsents: [],
    sessions: [
      {
        tokenHash: createHash("sha256").update(approvedSession).digest("hex"),
        userId: approvedUserId,
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      {
        tokenHash: createHash("sha256").update(deniedSession).digest("hex"),
        userId: deniedUserId,
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    ],
    passwordResets: [],
    emailVerifications: [],
    processedWebhooks: [],
    operatorSessions: [],
    audit: [],
    verifications: [],
    cases: [],
  }),
);

async function startServer(mode, port) {
  const child = spawn(process.execPath, ["server.mjs"], {
      cwd: root,
      env: {
        ...baseEnvironment,
        PORT: String(port),
        YOTI_MODE: mode,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }),
    logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/health/live`);
      if (response.ok) return { child, origin, logs };
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  child.kill("SIGTERM");
  throw new Error(`Yoti sandbox test server did not start. ${logs.join("")}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise((resolveWait) => setTimeout(resolveWait, 2000)),
  ]);
}

let sandboxServer, liveServer;
try {
  sandboxServer = await startServer("sandbox", basePort);
  const approvedHeaders = {
      "content-type": "application/json",
      cookie: `cp_session=${approvedSession}`,
      origin: sandboxServer.origin,
    },
    deniedHeaders = {
      ...approvedHeaders,
      cookie: `cp_session=${deniedSession}`,
    },
    configurationResponse = await fetch(
      `${sandboxServer.origin}/api/verification/age/config`,
      { headers: approvedHeaders },
    ),
    configuration = await configurationResponse.json();
  assert.equal(configurationResponse.status, 200);
  assert.deepEqual(configuration, {
    provider: "content-protect-controlled-sandbox",
    mode: "sandbox",
    requestedAttribute: "age_over:18",
    testOnly: true,
  });
  assert.equal(
    (
      await fetch(`${sandboxServer.origin}/api/verification/age/config`, {
        headers: deniedHeaders,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${sandboxServer.origin}/api/verification/age/start`, {
        method: "POST",
        headers: approvedHeaders,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await fetch(
        `${sandboxServer.origin}/api/verification/age/sandbox-complete`,
        {
          method: "POST",
          headers: approvedHeaders,
          body: JSON.stringify({ password: "wrong-password" }),
        },
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(
        `${sandboxServer.origin}/api/verification/age/sandbox-complete`,
        {
          method: "POST",
          headers: deniedHeaders,
          body: JSON.stringify({ password }),
        },
      )
    ).status,
    403,
  );

  const completionResponse = await fetch(
      `${sandboxServer.origin}/api/verification/age/sandbox-complete`,
      {
        method: "POST",
        headers: approvedHeaders,
        body: JSON.stringify({ password }),
      },
    ),
    completion = await completionResponse.json();
  assert.equal(completionResponse.status, 200);
  assert.equal(completion.verified, true);
  assert.equal(completion.testOnly, true);
  assert.match(completion.user.ageVerifiedAt, /^\d{4}-\d{2}-\d{2}T/);

  const sandboxMe = await (
    await fetch(`${sandboxServer.origin}/api/me`, { headers: approvedHeaders })
  ).json();
  assert.match(sandboxMe.user.ageVerifiedAt, /^\d{4}-\d{2}-\d{2}T/);
  await stopServer(sandboxServer.child);

  const persisted = JSON.parse(
      await readFile(join(dataDirectory, "db.json"), "utf8"),
    ),
    ageRecord = persisted.verifications.find(
      (item) => item.userId === approvedUserId && item.kind === "age",
    ),
    serializedRecord = JSON.stringify(ageRecord).toLowerCase();
  assert.equal(ageRecord.status, "verified");
  assert.equal(ageRecord.evidence.mode, "sandbox");
  assert.equal(ageRecord.evidence.testOnly, true);
  assert.equal(serializedRecord.includes("dateofbirth"), false);
  assert.equal(serializedRecord.includes("document"), false);
  assert.equal(serializedRecord.includes("selfie"), false);

  liveServer = await startServer("live", basePort + 1);
  const liveHeaders = {
      ...approvedHeaders,
      origin: liveServer.origin,
    },
    liveMe = await (
      await fetch(`${liveServer.origin}/api/me`, { headers: liveHeaders })
    ).json();
  assert.equal(liveMe.user.ageVerifiedAt, null);
  assert.equal(
    (
      await fetch(`${liveServer.origin}/api/assets`, {
        method: "POST",
        headers: liveHeaders,
        body: JSON.stringify({}),
      })
    ).status,
    403,
  );

  console.log(
    JSON.stringify({
      ok: true,
      allowlistedTestAccountOnly: true,
      passwordReauthenticationRequired: true,
      productionYotiEndpointNeverCalledInSandbox: true,
      noRawIdentityDataStored: true,
      sandboxResultRejectedInLiveMode: true,
    }),
  );
} finally {
  if (sandboxServer?.child) await stopServer(sandboxServer.child);
  if (liveServer?.child) await stopServer(liveServer.child);
  await rm(dataDirectory, { recursive: true, force: true });
}
