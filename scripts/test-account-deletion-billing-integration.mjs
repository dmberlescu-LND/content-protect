import assert from "node:assert/strict";
import { createHash, scryptSync } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  dataDirectory = await mkdtemp(
    join(tmpdir(), "content-protect-account-deletion-test-"),
  ),
  port = 24000 + (process.pid % 1000),
  stripePort = 25000 + (process.pid % 1000),
  origin = `http://127.0.0.1:${port}`,
  stripeOrigin = `http://127.0.0.1:${stripePort}`,
  userId = "11111111-1111-4111-8111-111111111111",
  sessionToken = "account-deletion-customer-session",
  password = "Correct horse battery staple 2026!",
  salt = "ab".repeat(16),
  subscriptionId = "sub_accountdelete123",
  customerId = "cus_accountdelete123",
  consentId = "22222222-2222-4222-8222-222222222222",
  now = "2026-07-20T12:00:00.000Z",
  childEnvironment = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "test",
    CONTENT_PROTECT_DATA_DIR: dataDirectory,
    CONTENT_PROTECT_MASTER_KEY:
      "account-deletion-integration-master-key-" + "m".repeat(40),
    PAYMENTS_MODE: "test",
    STRIPE_SECRET_KEY: "sk_test_account_deletion_integration",
    STRIPE_WEBHOOK_SECRET: "whsec_account_deletion_integration",
    STRIPE_PRICE_MONITOR: "price_monitorAccount123",
    STRIPE_PRICE_PROTECT: "price_protectAccount123",
    STRIPE_PRICE_PRO: "price_proAccount123",
    STRIPE_TEST_API_BASE: `${stripeOrigin}/`,
    YOTI_MODE: "sandbox",
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
        email: "account-deletion@example.test",
        name: "Account Deletion Test",
        stageName: "Deletion Test",
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
    assets: [],
    cases: [],
    matches: [],
    scans: [],
    subscriptions: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        userId,
        plan: "Protect",
        status: "active",
        mode: "stripe_test",
        stripeLivemode: false,
        stripePriceId: "price_protectAccount123",
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        billingConsentId: consentId,
        renewalAt: "2026-08-20T12:00:00.000Z",
        createdAt: now,
        updatedAt: now,
      },
    ],
    billingConsents: [
      {
        id: consentId,
        userId,
        plan: "Protect",
        termsVersion: "2026-07-19-v1.1",
        immediateServiceRequested: true,
        coolingOffAcknowledged: true,
        stripeCheckoutSessionId: "cs_test_accountdelete123",
        createdAt: now,
      },
    ],
    accountingRecords: [],
    audit: [],
    sessions: [
      {
        tokenHash: createHash("sha256").update(sessionToken).digest("hex"),
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
    operatorSessions: [],
  }),
);

let subscriptionStatus = "active",
  exposePendingInvoiceItem = true,
  cancelRequests = 0,
  pendingItemChecks = 0,
  invoiceChecks = 0,
  cancellationParameters = "";
const stripeServer = createServer(async (req, res) => {
  const url = new URL(req.url, stripeOrigin);
  res.setHeader("content-type", "application/json");
  res.setHeader("request-id", "req_account_deletion_test");
  if (
    req.method === "GET" &&
    url.pathname === `/v1/subscriptions/${subscriptionId}`
  ) {
    res.end(
      JSON.stringify({
        id: subscriptionId,
        object: "subscription",
        customer: customerId,
        livemode: false,
        status: subscriptionStatus,
      }),
    );
    return;
  }
  if (
    req.method === "DELETE" &&
    url.pathname === `/v1/subscriptions/${subscriptionId}`
  ) {
    cancelRequests += 1;
    cancellationParameters = url.searchParams.toString();
    for await (const chunk of req)
      cancellationParameters += `&${chunk.toString()}`;
    subscriptionStatus = "canceled";
    res.end(
      JSON.stringify({
        id: subscriptionId,
        object: "subscription",
        customer: customerId,
        livemode: false,
        status: "canceled",
      }),
    );
    return;
  }
  if (req.method === "GET" && url.pathname === "/v1/invoiceitems") {
    pendingItemChecks += 1;
    assert.equal(url.searchParams.get("customer"), customerId);
    assert.equal(url.searchParams.get("pending"), "true");
    res.end(
      JSON.stringify({
        object: "list",
        has_more: false,
        url: "/v1/invoiceitems",
        data: exposePendingInvoiceItem
          ? [
              {
                id: "ii_accountdelete123",
                object: "invoiceitem",
                customer: customerId,
                subscription: subscriptionId,
                amount: 500,
                currency: "gbp",
                livemode: false,
              },
            ]
          : [],
      }),
    );
    return;
  }
  if (req.method === "GET" && url.pathname === "/v1/invoices") {
    invoiceChecks += 1;
    const status = url.searchParams.get("status");
    assert.equal(url.searchParams.get("customer"), customerId);
    assert.equal(url.searchParams.get("subscription"), subscriptionId);
    assert.ok(["open", "draft"].includes(status));
    res.end(
      JSON.stringify({
        object: "list",
        has_more: false,
        url: "/v1/invoices",
        data:
          status === "open"
            ? [
                {
                  id: "in_accountdelete123",
                  object: "invoice",
                  customer: customerId,
                  subscription: subscriptionId,
                  livemode: false,
                  status: "open",
                  auto_advance: false,
                },
              ]
            : [],
      }),
    );
    return;
  }
  res.statusCode = 404;
  res.end(
    JSON.stringify({ error: { message: "Unexpected Stripe test route" } }),
  );
});
await new Promise((resolveListen, rejectListen) => {
  stripeServer.once("error", rejectListen);
  stripeServer.listen(stripePort, "127.0.0.1", resolveListen);
});

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
  throw new Error(
    `Account-deletion test server did not start. ${logs.join("")}`,
  );
}

async function deleteAccount() {
  return fetch(`${origin}/api/account`, {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      cookie: `cp_session=${sessionToken}`,
      origin,
    },
    body: JSON.stringify({ password }),
  });
}

try {
  await waitForServer();
  const blocked = await deleteAccount();
  assert.equal(blocked.status, 409);
  assert.match(await blocked.text(), /recurring billing was ended/i);
  assert.equal(cancelRequests, 1);
  assert.match(cancellationParameters, /invoice_now=false/);
  assert.match(cancellationParameters, /prorate=false/);
  assert.match(cancellationParameters, /cancellation_details%5Bcomment%5D=/);

  const retained = JSON.parse(
    await readFile(join(dataDirectory, "db.json"), "utf8"),
  );
  assert.equal(retained.users.length, 1);
  assert.equal(retained.subscriptions[0].status, "canceled");
  assert.equal(retained.users[0].plan, "Unsubscribed");

  exposePendingInvoiceItem = false;
  const deleted = await deleteAccount();
  if (deleted.status !== 200)
    throw new Error(`Account deletion retry failed: ${await deleted.text()}`);
  const result = await deleted.json();
  assert.equal(result.ok, true);
  assert.equal(cancelRequests, 1);
  assert.equal(pendingItemChecks, 2);
  assert.equal(invoiceChecks, 4);

  const finalState = JSON.parse(
    await readFile(join(dataDirectory, "db.json"), "utf8"),
  );
  assert.equal(finalState.users.length, 0);
  assert.equal(finalState.subscriptions.length, 0);
  assert.equal(finalState.billingConsents.length, 0);
  assert.equal(finalState.sessions.length, 0);
  assert.equal(finalState.accountingRecords.length, 2);
  assert.ok(
    finalState.accountingRecords.some(
      (item) => item.record?.status === "canceled",
    ),
  );

  console.log(
    JSON.stringify({
      ok: true,
      exactSubscriptionAndCustomerBound: true,
      immediateCancellationVerified: true,
      noFinalInvoiceOrProrationRequested: true,
      pendingInvoiceItemsBlockDeletion: true,
      pausedInvoicesVerified: true,
      canceledStatePersistedBeforeReview: true,
      retryDoesNotRepeatCancellation: true,
      accountingRecordRetained: true,
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
  await new Promise((resolveClose) => stripeServer.close(resolveClose));
  await rm(dataDirectory, { recursive: true, force: true });
}
