import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { totpAt } from "../totp.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  dataDirectory = await mkdtemp(
    join(tmpdir(), "content-protect-dispute-test-"),
  ),
  port = 21000 + (process.pid % 1000),
  origin = `http://127.0.0.1:${port}`,
  userId = "11111111-1111-4111-8111-111111111111",
  caseId = "22222222-2222-4222-8222-222222222222",
  matchId = "33333333-3333-4333-8333-333333333333",
  creatorSession = "creator-dispute-integration-session",
  operatorToken = "operator-dispute-token-" + "x".repeat(40),
  operatorSecret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
  contactEmail = "reported-party-unique@example.test",
  disputeStatement =
    "I have a current written licence for this reported use and request that all follow-ups stop while it is reviewed.",
  targetUrl = "https://reported.example/post",
  now = "2026-07-19T22:30:00.000Z",
  environment = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "test",
    CONTENT_PROTECT_DATA_DIR: dataDirectory,
    CONTENT_PROTECT_MASTER_KEY: "dispute-integration-master-" + "m".repeat(40),
    TAKEDOWN_OPERATOR_ID: "dispute-reviewer-01",
    TAKEDOWN_OPERATOR_TOKEN: operatorToken,
    TAKEDOWN_OPERATOR_TOTP_SECRET: operatorSecret,
  };

for (const key of [
  "DATABASE_URL",
  "OBJECT_STORAGE_ENDPOINT",
  "OBJECT_STORAGE_BUCKET",
  "OBJECT_STORAGE_ACCESS_KEY_ID",
  "OBJECT_STORAGE_SECRET_ACCESS_KEY",
])
  delete environment[key];

await writeFile(
  join(dataDirectory, "db.json"),
  JSON.stringify({
    users: [
      {
        id: userId,
        email: "creator@example.test",
        name: "Creator Legal Name",
        stageName: "Creator",
        salt: "00".repeat(16),
        passwordHash: "00".repeat(64),
        plan: "Unsubscribed",
        onboardingComplete: true,
        emailVerifiedAt: now,
        ageVerifiedAt: now,
        eligibilityAcceptedAt: now,
        aliases: [],
        platforms: [],
        createdAt: now,
      },
    ],
    sessions: [
      {
        tokenHash: createHash("sha256").update(creatorSession).digest("hex"),
        userId,
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    ],
    operatorSessions: [],
    assets: [],
    scans: [],
    matches: [
      {
        id: matchId,
        userId,
        assetId: "44444444-4444-4444-8444-444444444444",
        sourceUrl: targetUrl,
        site: "reported.example",
        type: "Image",
        confidence: 91,
        status: "Action needed",
        age: now,
        evidence: {},
      },
    ],
    cases: [
      {
        id: caseId,
        userId,
        matchId,
        source: "reported.example",
        targetUrl,
        targetHost: "reported.example",
        noticeType: "copyright",
        status: "Delivered — monitoring",
        mode: "live",
        evidenceSnapshot: {},
        evidenceHash: "a".repeat(64),
        noticeDraft: { version: "2026-07-19-v3" },
        declarations: {},
        recipientEmail: "legal@reported.example",
        providerMessageId: "resend-message-1",
        submittedAt: now,
        deliveredAt: now,
        nextActionAt: "2026-07-26T22:30:00.000Z",
        createdAt: now,
        updatedAt: now,
        timeline: [],
      },
    ],
    subscriptions: [],
    billingConsents: [],
    passwordResets: [],
    emailVerifications: [],
    processedWebhooks: [],
    audit: [],
    verifications: [],
  }),
);

const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: environment,
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
  throw new Error(`Dispute test server did not start. ${logs.join("")}`);
}

const publicHeaders = { "content-type": "application/json", origin },
  validSubmission = {
    caseReference: caseId,
    reportedUrl: targetUrl,
    email: contactEmail,
    country: "GB",
    category: "licence",
    statement: disputeStatement,
    supportingUrl: "https://reported.example/licence",
    confirmAccuracy: true,
    confirmAuthority: true,
    confirmNoSensitiveAttachments: true,
    privacyAccepted: true,
  };

try {
  await waitForServer();
  assert.equal(
    (
      await fetch(`${origin}/api/public/disputes`, {
        method: "POST",
        headers: publicHeaders,
        body: JSON.stringify({
          ...validSubmission,
          statement: "too short",
        }),
      })
    ).status,
    400,
  );
  const unknown = await fetch(`${origin}/api/public/disputes`, {
    method: "POST",
    headers: publicHeaders,
    body: JSON.stringify({
      ...validSubmission,
      caseReference: "99999999-9999-4999-8999-999999999999",
    }),
  });
  assert.equal(unknown.status, 202);
  assert.equal((await unknown.json()).received, true);

  const submitted = await fetch(`${origin}/api/public/disputes`, {
    method: "POST",
    headers: publicHeaders,
    body: JSON.stringify(validSubmission),
  });
  assert.equal(submitted.status, 202);
  const submittedBody = await submitted.json();
  assert.match(submittedBody.reference, /^[0-9a-f-]{36}$/i);

  const storedText = await readFile(join(dataDirectory, "db.json"), "utf8"),
    stored = JSON.parse(storedText),
    disputedCase = stored.cases.find((item) => item.id === caseId),
    receivedEvent = disputedCase.timeline.find((event) =>
      event.event.startsWith("Dispute received"),
    );
  assert.equal(disputedCase.status, "Disputed — review required");
  assert.equal(disputedCase.nextActionAt, null);
  assert.equal(typeof receivedEvent.details.ciphertext, "string");
  assert.equal(storedText.includes(contactEmail), false);
  assert.equal(storedText.includes(disputeStatement), false);
  assert.equal(
    stored.audit.some(
      (event) =>
        JSON.stringify(event.details).includes(contactEmail) ||
        JSON.stringify(event.details).includes(disputeStatement),
    ),
    false,
  );

  const duplicate = await fetch(`${origin}/api/public/disputes`, {
    method: "POST",
    headers: publicHeaders,
    body: JSON.stringify(validSubmission),
  });
  assert.equal(duplicate.status, 202);
  const afterDuplicate = JSON.parse(
    await readFile(join(dataDirectory, "db.json"), "utf8"),
  );
  assert.equal(
    afterDuplicate.cases[0].timeline.filter((event) =>
      event.event.startsWith("Dispute received"),
    ).length,
    1,
  );

  const creatorDashboard = await fetch(`${origin}/api/dashboard`, {
    headers: { cookie: `cp_session=${creatorSession}` },
  });
  assert.equal(creatorDashboard.status, 200);
  const creatorCase = (await creatorDashboard.json()).cases[0],
    creatorTimelineText = JSON.stringify(creatorCase.timeline);
  assert.equal(creatorCase.disputes[0].status, "open");
  assert.equal(creatorTimelineText.includes("ciphertext"), false);
  assert.equal(creatorTimelineText.includes("contactHash"), false);

  const baseTime = Date.now(),
    loginCode = totpAt(operatorSecret, baseTime - 30000),
    accessCode = totpAt(operatorSecret, baseTime),
    reviewCode = totpAt(operatorSecret, baseTime + 30000),
    login = await fetch(`${origin}/api/operator/session`, {
      method: "POST",
      headers: publicHeaders,
      body: JSON.stringify({ token: operatorToken, mfaCode: loginCode }),
    });
  assert.equal(login.status, 200);
  const operatorCookie = (login.headers.get("set-cookie") || "").split(";")[0],
    queue = await fetch(`${origin}/api/operator/cases`, {
      headers: { cookie: operatorCookie },
    });
  assert.equal(queue.status, 200);
  const operatorCase = (await queue.json()).cases[0],
    dispute = operatorCase.disputes[0];
  assert.equal(dispute.status, "open");
  assert.equal(JSON.stringify(operatorCase).includes(contactEmail), false);
  assert.equal(
    (
      await fetch(
        `${origin}/api/operator/cases/${caseId}/disputes/${dispute.disputeId}/access`,
        {
          method: "POST",
          headers: { ...publicHeaders, cookie: operatorCookie },
          body: JSON.stringify({ confirmNeedToReview: true }),
        },
      )
    ).status,
    401,
  );
  const beforeTamperText = await readFile(
      join(dataDirectory, "db.json"),
      "utf8",
    ),
    tamperedState = JSON.parse(beforeTamperText),
    tamperedEvent = tamperedState.cases[0].timeline.find((event) =>
      event.event.startsWith("Dispute received"),
    );
  tamperedEvent.details.ciphertext = `${tamperedEvent.details.ciphertext.slice(0, -2)}AA`;
  await writeFile(
    join(dataDirectory, "db.json"),
    JSON.stringify(tamperedState),
  );
  assert.equal(
    (
      await fetch(
        `${origin}/api/operator/cases/${caseId}/disputes/${dispute.disputeId}/access`,
        {
          method: "POST",
          headers: { ...publicHeaders, cookie: operatorCookie },
          body: JSON.stringify({
            confirmNeedToReview: true,
            mfaCode: accessCode,
          }),
        },
      )
    ).status,
    409,
  );
  await writeFile(join(dataDirectory, "db.json"), beforeTamperText);
  const access = await fetch(
    `${origin}/api/operator/cases/${caseId}/disputes/${dispute.disputeId}/access`,
    {
      method: "POST",
      headers: { ...publicHeaders, cookie: operatorCookie },
      body: JSON.stringify({
        confirmNeedToReview: true,
        mfaCode: accessCode,
      }),
    },
  );
  assert.equal(access.status, 200);
  const privateDispute = (await access.json()).dispute;
  assert.equal(privateDispute.contactEmail, contactEmail);
  assert.equal(privateDispute.statement, disputeStatement);
  assert.equal(
    (
      await fetch(
        `${origin}/api/operator/cases/${caseId}/disputes/${dispute.disputeId}/access`,
        {
          method: "POST",
          headers: { ...publicHeaders, cookie: operatorCookie },
          body: JSON.stringify({
            confirmNeedToReview: true,
            mfaCode: accessCode,
          }),
        },
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await fetch(
        `${origin}/api/operator/cases/${caseId}/disputes/${dispute.disputeId}/review`,
        {
          method: "POST",
          headers: { ...publicHeaders, cookie: operatorCookie },
          body: JSON.stringify({
            action: "accept",
            reviewNote:
              "The supplied licence explanation is sufficient to close the case.",
            confirmCaseClosure: true,
            mfaCode: reviewCode,
          }),
        },
      )
    ).status,
    400,
  );
  const review = await fetch(
    `${origin}/api/operator/cases/${caseId}/disputes/${dispute.disputeId}/review`,
    {
      method: "POST",
      headers: { ...publicHeaders, cookie: operatorCookie },
      body: JSON.stringify({
        action: "accept",
        reviewNote:
          "The supplied licence explanation is sufficient to close the case.",
        confirmCaseClosure: true,
        confirmCreatorNotified: true,
        mfaCode: reviewCode,
      }),
    },
  );
  assert.equal(review.status, 200);
  assert.equal((await review.json()).status, "Closed — dispute accepted");
  const finalState = JSON.parse(
    await readFile(join(dataDirectory, "db.json"), "utf8"),
  );
  assert.equal(finalState.cases[0].status, "Closed — dispute accepted");
  assert.equal(finalState.cases[0].nextActionAt, null);
  assert.equal(
    finalState.audit.some((event) => event.action === "case.dispute_resolved"),
    true,
  );

  console.log(
    JSON.stringify({
      ok: true,
      genericUnknownCaseResponse: true,
      deliveredCaseFrozenImmediately: true,
      duplicateOpenSubmissionSuppressed: true,
      contactAndStatementEncrypted: true,
      disputeTamperingRejected: true,
      auditMetadataMinimised: true,
      creatorResponseSanitised: true,
      operatorQueueMetadataOnly: true,
      operatorTotpAccessRequired: true,
      operatorTotpReplayRejected: true,
      creatorNotificationRequired: true,
      resolvedCaseRemainsFrozenAndClosed: true,
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
