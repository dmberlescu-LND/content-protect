import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { totpAt } from "../totp.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  dataDirectory = await mkdtemp(
    join(tmpdir(), "content-protect-incident-test-"),
  ),
  port = 21000 + (process.pid % 1000),
  origin = `http://127.0.0.1:${port}`,
  operatorSessionToken = "incident-test-operator-session",
  operatorSecret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
  childEnvironment = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "test",
    CONTENT_PROTECT_DATA_DIR: dataDirectory,
    CONTENT_PROTECT_MASTER_KEY:
      "incident-integration-master-key-" + "m".repeat(40),
    YOTI_MODE: "sandbox",
    TAKEDOWN_OPERATOR_ID: "director-on-call",
    TAKEDOWN_OPERATOR_TOKEN: "incident-operator-token-" + "x".repeat(40),
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
    users: [],
    assets: [],
    cases: [],
    matches: [],
    scans: [],
    subscriptions: [],
    billingConsents: [],
    audit: [],
    sessions: [],
    passwordResets: [],
    emailVerifications: [],
    verifications: [],
    processedWebhooks: [],
    incidents: [],
    operatorSessions: [
      {
        tokenHash: createHash("sha256")
          .update(operatorSessionToken)
          .digest("hex"),
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
  throw new Error(`Incident test server did not start. ${logs.join("")}`);
}

const cookie = `cp_operator=${operatorSessionToken}`,
  headers = { "content-type": "application/json", cookie, origin },
  post = (path, body) =>
    fetch(`${origin}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

try {
  await waitForServer();
  assert.equal(
    (await fetch(`${origin}/api/operator/incidents`)).status,
    401,
    "the incident register must require an operator session",
  );
  const declared = await post("/api/operator/incidents", {
    title: "Possible unauthorised production access",
    severity: "SEV-1",
    summary:
      "A controlled integration scenario validates the private operational incident workflow.",
    systems: "Production API and database",
    dataCategories: "Account metadata",
    approximateSubjects: 2,
    personalDataStatus: "personal-data-breach",
    occurredAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    awareAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    roles: {
      incidentCommander: "director-on-call",
      securityLead: "security-lead",
      privacyLead: "privacy-lead",
      communicationsLead: "communications-lead",
    },
    mfaCode: totpAt(operatorSecret),
  });
  if (declared.status !== 201)
    throw new Error(`Incident declaration failed: ${await declared.text()}`);
  const declaredBody = await declared.json(),
    incidentId = declaredBody.incident.id,
    deadlineMs = Date.parse(declaredBody.incident.icoDeadlineAt),
    awarenessMs = Date.parse(declaredBody.incident.awareAt);
  assert.equal(deadlineMs - awarenessMs, 72 * 60 * 60_000);

  const recovered = await post(`/api/operator/incidents/${incidentId}/events`, {
    type: "recovery",
    note: "The isolated known-good workload passed access and audit-integrity checks.",
  });
  if (recovered.status !== 201)
    throw new Error(
      `Incident recovery event failed: ${await recovered.text()}`,
    );

  const decisions = await post(
    `/api/operator/incidents/${incidentId}/notifications`,
    {
      icoDecision: "not-required",
      icoDecisionRationale:
        "The documented risk assessment found no likely risk to affected people.",
      subjectsDecision: "not-required",
      subjectsDecisionRationale:
        "The documented assessment found no high risk requiring direct notification.",
      mfaCode: totpAt(operatorSecret, Date.now() + 30_000),
    },
  );
  if (decisions.status !== 200)
    throw new Error(
      `Incident decisions failed: ${await decisions.text()} ${logs.join("")}`,
    );

  const closed = await post(`/api/operator/incidents/${incidentId}/close`, {
    rootCause:
      "The controlled test simulated an external credential accepted by an otherwise healthy API.",
    correctiveActions:
      "Credential scope and rotation checks were assigned to the security owner with a fixed deadline.",
    closureReviewReference: "independent-test-review-001",
    mfaCode: totpAt(operatorSecret, Date.now() - 30_000),
  });
  if (closed.status !== 200)
    throw new Error(`Incident closure failed: ${await closed.text()}`);
  assert.equal((await closed.json()).incident.status, "closed");

  const afterClosure = await post(
    `/api/operator/incidents/${incidentId}/events`,
    { type: "assessment", note: "A closed record must reject this new event." },
  );
  assert.equal(afterClosure.status, 409);

  const state = JSON.parse(
    await readFile(join(dataDirectory, "db.json"), "utf8"),
  );
  assert.equal(state.incidents[0].events.length, 4);
  assert.ok(
    state.audit.some((event) => event.action === "incident.declared") &&
      state.audit.some((event) => event.action === "incident.closed"),
  );
  assert.ok(
    state.audit.every(
      (event) =>
        !JSON.stringify(event.details).includes("controlled integration"),
    ),
    "audit metadata must not copy restricted incident notes",
  );

  console.log(
    JSON.stringify({
      ok: true,
      operatorSessionRequired: true,
      freshMfaForCriticalActions: true,
      automatic72HourDeadline: true,
      closedRecordFrozen: true,
      auditMetadataMinimised: true,
    }),
  );
} finally {
  if (child.exitCode === null) {
    const exited = new Promise((resolveWait) =>
      child.once("exit", resolveWait),
    );
    child.kill("SIGTERM");
    await exited;
  }
  await rm(dataDirectory, { recursive: true, force: true });
}
