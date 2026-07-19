import assert from "node:assert/strict";
import { createHash, scryptSync } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  dataDirectory = await mkdtemp(
    join(tmpdir(), "content-protect-capture-test-"),
  ),
  port = 20000 + (process.pid % 1000),
  origin = `http://127.0.0.1:${port}`,
  userId = "11111111-1111-4111-8111-111111111111",
  assetId = "22222222-2222-4222-8222-222222222222",
  matchId = "33333333-3333-4333-8333-333333333333",
  rightsRecordId = "44444444-4444-4444-8444-444444444444",
  scanId = "55555555-5555-4555-8555-555555555555",
  sessionToken = "creator-page-capture-session-token",
  password = "secure-test-password",
  salt = "11".repeat(16),
  now = "2026-07-19T21:00:00.000Z",
  priceId = "price_test_protect_capture",
  childEnvironment = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "test",
    CONTENT_PROTECT_DATA_DIR: dataDirectory,
    CONTENT_PROTECT_MASTER_KEY:
      "page-capture-integration-master-key-" + "m".repeat(40),
    PAYMENTS_MODE: "test",
    STRIPE_SECRET_KEY: "sk_test_" + "x".repeat(32),
    STRIPE_WEBHOOK_SECRET: "whsec_" + "x".repeat(32),
    STRIPE_PRICE_MONITOR: "price_test_monitor_capture",
    STRIPE_PRICE_PROTECT: priceId,
    STRIPE_PRICE_PRO: "price_test_pro_capture",
  },
  screenshot = await sharp({
    create: {
      width: 320,
      height: 240,
      channels: 3,
      background: { r: 82, g: 69, b: 146 },
    },
  })
    .png()
    .toBuffer();

await writeFile(
  join(dataDirectory, "db.json"),
  JSON.stringify({
    users: [
      {
        id: userId,
        email: "creator@example.test",
        name: "Test Creator Legal Name",
        stageName: "Test Creator",
        salt,
        passwordHash: scryptSync(password, salt, 64).toString("hex"),
        plan: "Protect",
        onboardingComplete: true,
        emailVerifiedAt: now,
        ageVerifiedAt: now,
        eligibilityAcceptedAt: now,
        eligibilityVersion: "2026-07-18-v1",
        aliases: [],
        platforms: [],
        createdAt: now,
      },
    ],
    assets: [
      {
        id: assetId,
        userId,
        objectKey: `${userId}/${assetId}.vault`,
        name: "reference.jpg",
        mime: "image/jpeg",
        size: 1024,
        checksum: "a".repeat(64),
        status: "Protected",
        createdAt: now,
      },
    ],
    matches: [
      {
        id: matchId,
        scanId,
        userId,
        assetId,
        site: "copied.example",
        sourceUrl: "https://copied.example/post",
        type: "Image",
        confidence: 92,
        status: "Action needed",
        age: now,
        evidence: { provider: "test-provider" },
      },
    ],
    scans: [],
    subscriptions: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        userId,
        plan: "Protect",
        status: "active",
        mode: "stripe_test",
        stripeLivemode: false,
        stripePriceId: priceId,
        createdAt: now,
        updatedAt: now,
      },
    ],
    billingConsents: [],
    sessions: [
      {
        tokenHash: createHash("sha256").update(sessionToken).digest("hex"),
        userId,
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    ],
    passwordResets: [],
    emailVerifications: [],
    processedWebhooks: [],
    operatorSessions: [],
    audit: [],
    verifications: [
      {
        id: rightsRecordId,
        userId,
        kind: "content_rights",
        provider: "creator-attestation",
        providerReference: assetId,
        status: "pending",
        evidence: {
          assetId,
          role: "copyright-owner",
          roleLabel: "Copyright owner",
          rightsHolderName: "Test Creator Legal Name",
          workTitle: "Test work",
          originalPublicationUrl: "https://creator.example/original",
          authorityEvidenceReference: "original-source-file-001",
          declarationVersion: "2026-07-19-v1",
          declaredAt: now,
        },
        expiresAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    cases: [],
  }),
);

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
  throw new Error(`Page-capture test server did not start. ${logs.join("")}`);
}

try {
  await waitForServer();
  const headers = {
    "content-type": "application/json",
    cookie: `cp_session=${sessionToken}`,
    origin,
  };
  assert.equal(
    (
      await fetch(`${origin}/api/cases`, {
        method: "POST",
        headers,
        body: JSON.stringify({ matchId }),
      })
    ).status,
    409,
  );
  const captureBody = {
    name: "copied-page.png",
    mime: "image/png",
    data: screenshot.toString("base64"),
    pageCaptureConsent: true,
    confirmTargetPage: true,
    confirmUnaltered: true,
  };
  assert.equal(
    (
      await fetch(`${origin}/api/matches/${matchId}/page-capture`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...captureBody, confirmUnaltered: false }),
      })
    ).status,
    400,
  );
  const captured = await fetch(
    `${origin}/api/matches/${matchId}/page-capture`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(captureBody),
    },
  );
  assert.equal(captured.status, 201);
  const capture = (await captured.json()).pageCapture;
  assert.equal(capture.sourceUrl, "https://copied.example/post");
  assert.equal(
    capture.checksumSha256,
    createHash("sha256").update(screenshot).digest("hex"),
  );

  const dashboard = await fetch(`${origin}/api/dashboard`, {
    headers: { cookie: `cp_session=${sessionToken}` },
  });
  assert.equal(dashboard.status, 200);
  const dashboardState = await dashboard.json();
  assert.equal(dashboardState.assets.length, 1);
  assert.equal(dashboardState.entitlements.assetSlotsRemaining, 24);
  assert.equal(dashboardState.matches[0].pageCapture.assetId, capture.assetId);

  const download = await fetch(
    `${origin}/api/matches/${matchId}/page-capture/download`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ password }),
    },
  );
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), screenshot);

  const created = await fetch(`${origin}/api/cases`, {
    method: "POST",
    headers,
    body: JSON.stringify({ matchId }),
  });
  assert.equal(created.status, 201);
  const createdCase = (await created.json()).case;
  assert.equal(createdCase.evidenceSnapshot.version, 3);
  assert.equal(
    createdCase.evidenceSnapshot.pageCapture.checksumSha256,
    capture.checksumSha256,
  );
  assert.equal(
    createHash("sha256")
      .update(JSON.stringify(createdCase.evidenceSnapshot))
      .digest("hex"),
    createdCase.evidenceHash,
  );
  const postCaseDashboard = await fetch(`${origin}/api/dashboard`, {
    headers: { cookie: `cp_session=${sessionToken}` },
  });
  assert.equal(
    (await postCaseDashboard.json()).matches[0].status,
    "Case review",
  );
  assert.equal(
    (
      await fetch(`${origin}/api/matches/${matchId}/page-capture`, {
        method: "POST",
        headers,
        body: JSON.stringify(captureBody),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await fetch(`${origin}/api/assets/${capture.assetId}`, {
        method: "DELETE",
        headers,
      })
    ).status,
    409,
  );

  const persisted = JSON.parse(
    await readFile(join(dataDirectory, "db.json"), "utf8"),
  );
  assert.equal(
    persisted.assets.find((item) => item.id === capture.assetId).status,
    "Evidence capture",
  );

  console.log(
    JSON.stringify({
      ok: true,
      caseBlockedWithoutCapture: true,
      explicitConsentRequired: true,
      encryptedCaptureStored: true,
      planLimitUnaffected: true,
      creatorPasswordDownload: true,
      caseHashBindsCapture: true,
      caseStatusNotMislabelledAsSent: true,
      postCaseReplacementRejected: true,
      directEvidenceDeletionRejected: true,
    }),
  );
} finally {
  if (child.exitCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  }
  await rm(dataDirectory, { recursive: true, force: true });
}
