import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  userId = "11111111-1111-4111-8111-111111111111",
  assetId = "22222222-2222-4222-8222-222222222222",
  editableAssetId = "22222222-2222-4222-8222-222222222223",
  captureAssetId = "22222222-2222-4222-8222-222222222224",
  matchId = "33333333-3333-4333-8333-333333333333",
  caseId = "44444444-4444-4444-8444-444444444444",
  rightsRecordId = "55555555-5555-4555-8555-555555555555",
  declaredAt = "2026-07-19T20:00:00.000Z",
  masterSecret = "operator-integration-master-key-" + "m".repeat(40),
  captureBytes = Buffer.from("operator page capture integration evidence"),
  captureChecksum = createHash("sha256").update(captureBytes).digest("hex"),
  rightsDeclaration = {
    recordId: rightsRecordId,
    status: "pending",
    role: "copyright-owner",
    roleLabel: "Copyright owner",
    rightsHolderName: "Test Creator Legal Name",
    workTitle: "Test work",
    originalPublicationUrl: "https://creator.example/original",
    authorityEvidenceReference: "original-source-file-001",
    declarationVersion: "2026-07-19-v1",
    declaredAt,
  },
  pageCapture = {
    assetId: captureAssetId,
    sourceUrl: "https://copied.example/post",
    sourceHost: "copied.example",
    checksumSha256: captureChecksum,
    mime: "image/png",
    byteSize: captureBytes.length,
    width: 1200,
    height: 800,
    capturedAt: declaredAt,
    consentVersion: "2026-07-19-v1",
    attestedTargetPage: true,
    attestedUnaltered: true,
  },
  evidenceSnapshot = {
    version: 3,
    referenceAssetId: assetId,
    contentRights: rightsDeclaration,
    pageCapture,
    capturedAt: declaredAt,
  },
  creatorSessionToken = "creator-session-token-for-rights-test",
  childEnvironment = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "test",
    CONTENT_PROTECT_DATA_DIR: dataDirectory,
    CONTENT_PROTECT_MASTER_KEY: masterSecret,
    YOTI_MODE: "sandbox",
    TAKEDOWN_OPERATOR_ID: "test-director-01",
    TAKEDOWN_OPERATOR_TOKEN: token,
    TAKEDOWN_OPERATOR_TOTP_SECRET: secret,
  };

await writeFile(
  join(dataDirectory, "db.json"),
  JSON.stringify({
    users: [
      {
        id: userId,
        email: "creator@example.test",
        name: "Test Creator Legal Name",
        stageName: "Test Creator",
        salt: "00".repeat(16),
        passwordHash: "00".repeat(64),
        plan: "Unsubscribed",
        onboardingComplete: true,
        emailVerifiedAt: declaredAt,
        ageVerifiedAt: declaredAt,
        eligibilityAcceptedAt: declaredAt,
        eligibilityVersion: "2026-07-18-v1",
        aliases: [],
        platforms: [],
        createdAt: declaredAt,
      },
    ],
    assets: [
      {
        id: assetId,
        userId,
        objectKey: `${userId}/${assetId}.vault`,
        name: "preserved.jpg",
        mime: "image/jpeg",
        size: 1024,
        checksum: "a".repeat(64),
        status: "Protected",
        createdAt: declaredAt,
      },
      {
        id: editableAssetId,
        userId,
        objectKey: `${userId}/${editableAssetId}.vault`,
        name: "editable.jpg",
        mime: "image/jpeg",
        size: 1024,
        checksum: "b".repeat(64),
        status: "Protected",
        createdAt: declaredAt,
      },
      {
        id: captureAssetId,
        userId,
        objectKey: `${userId}/evidence/${captureAssetId}.vault`,
        name: "page-capture.png",
        mime: "image/png",
        size: captureBytes.length,
        checksum: captureChecksum,
        status: "Evidence capture",
        createdAt: declaredAt,
      },
    ],
    matches: [
      {
        id: matchId,
        scanId: "66666666-6666-4666-8666-666666666666",
        userId,
        assetId,
        site: "copied.example",
        sourceUrl: "https://copied.example/post",
        type: "Image",
        confidence: 90,
        status: "Action needed",
        age: declaredAt,
        evidence: {},
      },
    ],
    scans: [],
    subscriptions: [],
    billingConsents: [],
    sessions: [
      {
        tokenHash: createHash("sha256")
          .update(creatorSessionToken)
          .digest("hex"),
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
        id: "77777777-7777-4777-8777-777777777777",
        userId,
        kind: "age",
        provider: "content-protect-controlled-sandbox",
        providerReference: "sandbox-operator-test",
        status: "verified",
        evidence: { mode: "sandbox", testOnly: true, threshold: 18 },
        expiresAt: null,
        createdAt: declaredAt,
        updatedAt: declaredAt,
      },
      {
        id: rightsRecordId,
        userId,
        kind: "content_rights",
        provider: "creator-attestation",
        providerReference: assetId,
        status: "pending",
        evidence: { assetId, ...rightsDeclaration, recordId: undefined },
        expiresAt: null,
        createdAt: declaredAt,
        updatedAt: declaredAt,
      },
    ],
    cases: [
      {
        id: caseId,
        userId,
        matchId,
        source: "copied.example",
        targetUrl: "https://copied.example/post",
        targetHost: "copied.example",
        jurisdiction: "To be determined from recipient",
        noticeType: "copyright",
        status: "Awaiting operator preparation",
        mode: "sandbox",
        evidenceSnapshot,
        evidenceHash: createHash("sha256")
          .update(JSON.stringify(evidenceSnapshot))
          .digest("hex"),
        noticeDraft: {
          version: "2026-07-19-v3",
          contentRights: rightsDeclaration,
          rightsReview: null,
        },
        declarations: {},
        createdAt: declaredAt,
        updatedAt: declaredAt,
        timeline: [],
      },
    ],
  }),
);

const captureIv = randomBytes(12),
  captureCipher = createCipheriv(
    "aes-256-gcm",
    createHash("sha256").update(masterSecret).digest(),
    captureIv,
  ),
  encryptedCapture = Buffer.concat([
    captureIv,
    captureCipher.update(captureBytes),
    captureCipher.final(),
  ]),
  captureVault = Buffer.concat([
    encryptedCapture.subarray(0, 12),
    captureCipher.getAuthTag(),
    encryptedCapture.subarray(12),
  ]),
  capturePath = join(
    dataDirectory,
    "vault",
    userId,
    "evidence",
    `${captureAssetId}.vault`,
  );
await mkdir(dirname(capturePath), { recursive: true });
await writeFile(capturePath, captureVault);

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
  const creatorHeaders = {
      "content-type": "application/json",
      cookie: `cp_session=${creatorSessionToken}`,
      origin,
    },
    validRightsUpdate = {
      rightsRole: "exclusive-licensee",
      rightsHolderName: "Example Rights Company Ltd",
      workTitle: "Editable work",
      originalPublicationUrl: "https://creator.example/editable",
      authorityEvidenceReference: "exclusive-licence-2026-07",
      confirmRightsAuthority: true,
      confirmRightsAccurate: true,
    };
  assert.equal(
    (
      await fetch(`${origin}/api/assets/${editableAssetId}/rights`, {
        method: "PUT",
        headers: creatorHeaders,
        body: JSON.stringify({
          ...validRightsUpdate,
          confirmRightsAccurate: false,
        }),
      })
    ).status,
    400,
  );
  const rightsUpdated = await fetch(
    `${origin}/api/assets/${editableAssetId}/rights`,
    {
      method: "PUT",
      headers: creatorHeaders,
      body: JSON.stringify(validRightsUpdate),
    },
  );
  assert.equal(rightsUpdated.status, 200);
  assert.equal((await rightsUpdated.json()).rights.role, "exclusive-licensee");
  assert.equal(
    (
      await fetch(`${origin}/api/assets/${assetId}/rights`, {
        method: "PUT",
        headers: creatorHeaders,
        body: JSON.stringify(validRightsUpdate),
      })
    ).status,
    409,
  );
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

  const pendingCases = await fetch(`${origin}/api/operator/cases`, {
    headers: { cookie },
  });
  assert.equal(pendingCases.status, 200);
  const pending = (await pendingCases.json()).cases[0];
  assert.equal(pending.id, caseId);
  assert.equal(
    pending.rightsDeclaration.rightsHolderName,
    "Test Creator Legal Name",
  );
  assert.equal(pending.pageCapture.checksumSha256, captureChecksum);
  assert.equal(
    (
      await fetch(
        `${origin}/api/operator/cases/${caseId}/page-capture/download`,
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie, origin },
          body: JSON.stringify({ confirmEvidenceReview: true }),
        },
      )
    ).status,
    401,
  );
  const captureCode = totpAt(secret, Date.now() + 30000),
    captureDownload = await fetch(
      `${origin}/api/operator/cases/${caseId}/page-capture/download`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie, origin },
        body: JSON.stringify({
          confirmEvidenceReview: true,
          mfaCode: captureCode,
        }),
      },
    );
  if (captureDownload.status !== 200)
    throw new Error(
      `Operator capture download failed (${captureDownload.status}): ${await captureDownload.text()}`,
    );
  assert.deepEqual(
    Buffer.from(await captureDownload.arrayBuffer()),
    captureBytes,
  );
  assert.equal(
    (
      await fetch(
        `${origin}/api/operator/cases/${caseId}/page-capture/download`,
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie, origin },
          body: JSON.stringify({
            confirmEvidenceReview: true,
            mfaCode: captureCode,
          }),
        },
      )
    ).status,
    409,
  );

  const preparation = {
    recipientEmail: "copyright@example-host.test",
    recipientSource: "https://example-host.test/copyright",
    jurisdiction: "England and Wales / host copyright channel",
    legalBasis: "Copyright ownership and host removal policy",
    confirmRecipientReviewed: true,
    confirmJurisdictionReviewed: true,
  };
  assert.equal(
    (
      await fetch(`${origin}/api/operator/cases/${caseId}/prepare`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie, origin },
        body: JSON.stringify(preparation),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(`${origin}/api/operator/cases/${caseId}/prepare`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie, origin },
        body: JSON.stringify({
          ...preparation,
          confirmRightsReviewed: true,
          rightsReviewReference: "restricted-test-file-01",
        }),
      })
    ).status,
    400,
  );
  const prepared = await fetch(
    `${origin}/api/operator/cases/${caseId}/prepare`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin },
      body: JSON.stringify({
        ...preparation,
        confirmRightsReviewed: true,
        confirmPageCaptureReviewed: true,
        rightsReviewReference: "restricted-test-file-01",
      }),
    },
  );
  assert.equal(prepared.status, 200);
  const persistedState = JSON.parse(
      await readFile(join(dataDirectory, "db.json"), "utf8"),
    ),
    persistedCase = persistedState.cases.find((item) => item.id === caseId),
    persistedRights = persistedState.verifications.find(
      (item) => item.id === rightsRecordId,
    );
  assert.equal(persistedCase.status, "Awaiting creator approval");
  assert.equal(
    persistedCase.noticeDraft.rightsReview.reviewReference,
    "restricted-test-file-01",
  );
  assert.equal(persistedRights.status, "verified");
  assert.equal(
    persistedRights.evidence.reviewReference,
    "restricted-test-file-01",
  );

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
      perAssetRightsVisibleToOperator: true,
      pageCaptureVisibleToOperator: true,
      operatorCaptureTotpRequired: true,
      operatorCaptureReplayRejected: true,
      preparationBlockedWithoutRightsReview: true,
      preparationBlockedWithoutCaptureReview: true,
      rightsReviewPersisted: true,
      invalidCreatorDeclarationRejected: true,
      legacyAssetDeclarationSupported: true,
      casePreservedDeclarationImmutable: true,
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
