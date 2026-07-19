import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { totpAt } from "../totp.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  dataDirectory = await mkdtemp(join(tmpdir(), "content-protect-consumer-test-")),
  port = 22000 + (process.pid % 1000),
  origin = `http://127.0.0.1:${port}`,
  userId = "11111111-1111-4111-8111-111111111111",
  customerToken = "consumer-test-customer-session",
  operatorToken = "consumer-test-operator-session",
  operatorSecret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
  childEnvironment = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "test",
    CONTENT_PROTECT_DATA_DIR: dataDirectory,
    CONTENT_PROTECT_MASTER_KEY: "consumer-integration-master-key-" + "m".repeat(40),
    YOTI_MODE: "sandbox",
    TAKEDOWN_OPERATOR_ID: "support-director",
    TAKEDOWN_OPERATOR_TOKEN: "consumer-operator-token-" + "x".repeat(40),
    TAKEDOWN_OPERATOR_TOTP_SECRET: operatorSecret,
  };

for (const key of [
  "DATABASE_URL",
  "OBJECT_STORAGE_ENDPOINT",
  "OBJECT_STORAGE_BUCKET",
  "OBJECT_STORAGE_ACCESS_KEY_ID",
  "OBJECT_STORAGE_SECRET_ACCESS_KEY",
])
  delete childEnvironment[key];

await writeFile(
  join(dataDirectory, "db.json"),
  JSON.stringify({
    users: [
      {
        id: userId,
        email: "creator@example.test",
        name: "Test Creator",
        stageName: "Creator",
        salt: "00".repeat(16),
        passwordHash: "00".repeat(64),
        plan: "Unsubscribed",
        onboardingComplete: true,
        emailVerifiedAt: "2026-07-20T00:00:00.000Z",
        ageVerifiedAt: null,
        eligibilityAcceptedAt: "2026-07-20T00:00:00.000Z",
        eligibilityVersion: "2026-07-18-v1",
        aliases: [],
        platforms: [],
        createdAt: "2026-07-20T00:00:00.000Z",
      },
    ],
    assets: [],
    cases: [],
    matches: [],
    scans: [],
    subscriptions: [],
    billingConsents: [],
    audit: [],
    sessions: [
      {
        tokenHash: createHash("sha256").update(customerToken).digest("hex"),
        userId,
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    ],
    passwordResets: [],
    emailVerifications: [],
    verifications: [],
    processedWebhooks: [],
    incidents: [],
    consumerCases: [],
    operatorSessions: [
      {
        tokenHash: createHash("sha256").update(operatorToken).digest("hex"),
        expiresAt: "2099-01-01T00:00:00.000Z",
        createdAt: new Date().toISOString(),
      },
    ],
  }),
);

const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: childEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  }),
  logs = [];
child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
child.stderr.on("data", (chunk) => logs.push(chunk.toString()));

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${origin}/api/health/live`)).ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Consumer-case test server did not start. ${logs.join("")}`);
}

const customerHeaders = {
    "content-type": "application/json",
    cookie: `cp_session=${customerToken}`,
    origin,
  },
  operatorHeaders = {
    "content-type": "application/json",
    cookie: `cp_operator=${operatorToken}`,
    origin,
  },
  post = (path, body, headers = customerHeaders) =>
    fetch(`${origin}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

try {
  await waitForServer();
  assert.equal((await fetch(`${origin}/api/support/cases`)).status, 401);

  const createdResponse = await post("/api/support/cases", {
    category: "refund",
    subject: "Unexpected subscription payment",
    statement:
      "I am asking the company to review an unexpected payment and confirm the service record.",
    desiredResolution: "Refund any payment that was not properly authorised.",
    orderReference: "checkout/test-reference-001",
    confirmAccuracy: true,
    confirmNoSecretsOrMedia: true,
    privacyAccepted: true,
  });
  if (createdResponse.status !== 201)
    throw new Error(`Case creation failed: ${await createdResponse.text()}`);
  const created = (await createdResponse.json()).case;
  assert.match(created.reference, /^CP-[A-F0-9]{12}$/);
  assert.equal(created.refundDecision, "pending");

  const operatorList = await fetch(`${origin}/api/operator/consumer-cases`, {
    headers: operatorHeaders,
  });
  assert.equal(operatorList.status, 200);
  const listed = (await operatorList.json()).cases[0];
  assert.equal(listed.reference, created.reference);
  assert.equal(listed.statement, undefined);

  const access = await post(
    `/api/operator/consumer-cases/${created.id}/access`,
    { confirmNeedToReview: true, mfaCode: totpAt(operatorSecret) },
    operatorHeaders,
  );
  if (access.status !== 200)
    throw new Error(`Case access failed: ${await access.text()}`);
  assert.equal((await access.json()).case.subject, created.subject);

  const acknowledged = await post(
    `/api/operator/consumer-cases/${created.id}/actions`,
    {
      action: "acknowledge",
      note: "The request is assigned for billing review.",
      mfaCode: totpAt(operatorSecret, Date.now() + 30_000),
    },
    operatorHeaders,
  );
  if (acknowledged.status !== 200)
    throw new Error(`Case acknowledgement failed: ${await acknowledged.text()}`);
  assert.equal((await acknowledged.json()).case.status, "acknowledged");

  const message = await post(`/api/support/cases/${created.id}/messages`, {
    message: "Please also confirm the exact payment timestamp in your reply.",
    confirmNoSecretsOrMedia: true,
  });
  assert.equal(message.status, 201);
  assert.equal((await message.json()).case.status, "in-review");

  const stateText = await readFile(join(dataDirectory, "db.json"), "utf8"),
    state = JSON.parse(stateText);
  assert.equal(state.consumerCases.length, 1);
  assert.equal(state.consumerCases[0].events.length, 3);
  assert.ok(!stateText.includes("Unexpected subscription payment"));
  assert.ok(!stateText.includes("exact payment timestamp"));
  assert.ok(
    state.audit.some((event) => event.action === "consumer_case.created") &&
      state.audit.some(
        (event) => event.action === "consumer_case.acknowledged",
      ),
  );

  console.log(
    JSON.stringify({
      ok: true,
      authenticatedCustomerBinding: true,
      encryptedRestrictedDetails: true,
      operatorMfaAccess: true,
      metadataOnlyQueue: true,
      appendOnlyTimeline: true,
    }),
  );
} finally {
  if (child.exitCode === null) {
    const exited = new Promise((resolveWait) => child.once("exit", resolveWait));
    child.kill("SIGTERM");
    await exited;
  }
  await rm(dataDirectory, { recursive: true, force: true });
}
