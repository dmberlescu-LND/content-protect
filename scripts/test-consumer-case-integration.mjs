import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { totpAt } from "../totp.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  dataDirectory = await mkdtemp(
    join(tmpdir(), "content-protect-consumer-test-"),
  ),
  port = 22000 + (process.pid % 1000),
  stripePort = 23000 + (process.pid % 1000),
  origin = `http://127.0.0.1:${port}`,
  stripeOrigin = `http://127.0.0.1:${stripePort}`,
  userId = "11111111-1111-4111-8111-111111111111",
  customerToken = "consumer-test-customer-session",
  operatorToken = "consumer-test-operator-session",
  operatorSecret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
  childEnvironment = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "test",
    CONTENT_PROTECT_DATA_DIR: dataDirectory,
    CONTENT_PROTECT_MASTER_KEY:
      "consumer-integration-master-key-" + "m".repeat(40),
    PAYMENTS_MODE: "test",
    STRIPE_SECRET_KEY: "sk_test_consumer_refund_integration",
    STRIPE_WEBHOOK_SECRET: "whsec_consumer_refund_integration",
    STRIPE_PRICE_MONITOR: "price_monitorTest123",
    STRIPE_PRICE_PROTECT: "price_protectTest123",
    STRIPE_PRICE_PRO: "price_proTest123",
    STRIPE_TEST_API_BASE: `${stripeOrigin}/`,
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
    subscriptions: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        userId,
        plan: "Protect",
        status: "active",
        mode: "stripe_test",
        stripeLivemode: false,
        stripePriceId: "price_protectTest123",
        stripeCustomerId: "cus_consumerrefund123",
        stripeSubscriptionId: "sub_consumerrefund123",
        billingConsentId: "33333333-3333-4333-8333-333333333333",
        renewalAt: "2026-08-20T00:00:00.000Z",
        createdAt: "2026-07-20T00:00:00.000Z",
        updatedAt: "2026-07-20T00:00:00.000Z",
      },
    ],
    billingConsents: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        userId,
        plan: "Protect",
        termsVersion: "2026-07-19-v1.1",
        immediateServiceRequested: true,
        coolingOffAcknowledged: true,
        stripeCheckoutSessionId: "cs_test_consumerrefund123",
        createdAt: "2026-07-20T00:00:00.000Z",
      },
    ],
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

let stripeRefundRequests = 0,
  stripeInvoiceBindingRequests = 0,
  stripeIdempotencyKey = null,
  stripeRefundBody = "";
const stripeServer = createServer(async (req, res) => {
  const url = new URL(req.url, stripeOrigin);
  res.setHeader("content-type", "application/json");
  res.setHeader("request-id", "req_consumer_refund_test");
  if (
    req.method === "GET" &&
    url.pathname === "/v1/payment_intents/pi_consumerpayment123"
  ) {
    res.end(
      JSON.stringify({
        id: "pi_consumerpayment123",
        object: "payment_intent",
        customer: "cus_consumerrefund123",
        livemode: false,
        status: "succeeded",
        currency: "gbp",
        amount_received: 2400,
        latest_charge: {
          id: "ch_consumerpayment123",
          object: "charge",
          amount_refunded: 0,
        },
      }),
    );
    return;
  }
  if (req.method === "GET" && url.pathname === "/v1/invoice_payments") {
    stripeInvoiceBindingRequests += 1;
    res.end(
      JSON.stringify({
        object: "list",
        has_more: false,
        url: "/v1/invoice_payments",
        data: [
          {
            id: "inpay_consumerpayment123",
            object: "invoice_payment",
            amount_paid: 2400,
            currency: "gbp",
            livemode: false,
            status: "paid",
            payment: {
              type: "payment_intent",
              payment_intent: "pi_consumerpayment123",
            },
            invoice: {
              id: "in_consumerpayment123",
              object: "invoice",
              customer: "cus_consumerrefund123",
              currency: "gbp",
              livemode: false,
              status: "paid",
              parent: {
                type: "subscription_details",
                subscription_details: {
                  subscription: "sub_consumerrefund123",
                  metadata: {
                    userId,
                    mode: "test",
                    priceId: "price_protectTest123",
                  },
                },
              },
            },
          },
        ],
      }),
    );
    return;
  }
  if (req.method === "POST" && url.pathname === "/v1/refunds") {
    stripeRefundRequests += 1;
    stripeIdempotencyKey = req.headers["idempotency-key"] || null;
    for await (const chunk of req) stripeRefundBody += chunk.toString();
    res.end(
      JSON.stringify({
        id: "re_consumerrefund123",
        object: "refund",
        payment_intent: "pi_consumerpayment123",
        amount: 1900,
        currency: "gbp",
        status: "succeeded",
        failure_reason: null,
      }),
    );
    return;
  }
  res.statusCode = 404;
  res.end(
    JSON.stringify({ error: { message: "Unexpected test Stripe route" } }),
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
    {
      confirmNeedToReview: true,
      mfaCode: totpAt(operatorSecret, Date.now() - 30_000),
    },
    operatorHeaders,
  );
  if (access.status !== 200)
    throw new Error(`Case access failed: ${await access.text()}`);
  assert.equal((await access.json()).case.subject, created.subject);

  const decision = await post(
    `/api/operator/consumer-cases/${created.id}/actions`,
    {
      action: "refund-decision",
      note: "The payment and service record support the approved refund.",
      refundDecision: "approved",
      refundAmountPence: 1900,
      decisionReference: "billing/refund-decision-test-001",
      mfaCode: totpAt(operatorSecret),
    },
    operatorHeaders,
  );
  if (decision.status !== 200)
    throw new Error(`Refund decision failed: ${await decision.text()}`);
  assert.equal((await decision.json()).case.refundDecision, "approved");

  const message = await post(`/api/support/cases/${created.id}/messages`, {
    message: "Please also confirm the exact payment timestamp in your reply.",
    confirmNoSecretsOrMedia: true,
  });
  assert.equal(message.status, 201);
  assert.equal((await message.json()).case.status, "in-review");

  const refund = await post(
    `/api/operator/consumer-cases/${created.id}/refund`,
    {
      paymentIntentReference: "pi_consumerpayment123",
      note: "The approved customer refund is executed to the original payment.",
      confirmRefundExecution: true,
      mfaCode: totpAt(operatorSecret, Date.now() + 30_000),
    },
    operatorHeaders,
  );
  if (refund.status !== 200)
    throw new Error(`Verified Stripe refund failed: ${await refund.text()}`);
  const refundedCase = (await refund.json()).case;
  assert.equal(refundedCase.refundProviderStatus, "succeeded");
  assert.match(refundedCase.refundCompletedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(stripeRefundRequests, 1);
  assert.equal(stripeInvoiceBindingRequests, 1);
  assert.match(stripeIdempotencyKey, /^content-protect-refund:/);
  assert.match(stripeRefundBody, /payment_intent=pi_consumerpayment123/);
  assert.match(stripeRefundBody, /amount=1900/);

  const stateText = await readFile(join(dataDirectory, "db.json"), "utf8"),
    state = JSON.parse(stateText);
  assert.equal(state.consumerCases.length, 1);
  assert.equal(state.consumerCases[0].events.length, 4);
  assert.equal(state.consumerCases[0].refundProviderStatus, "succeeded");
  assert.equal(
    state.consumerCases[0].refundProviderReference,
    "re_consumerrefund123",
  );
  assert.ok(!stateText.includes("Unexpected subscription payment"));
  assert.ok(!stateText.includes("exact payment timestamp"));
  assert.ok(
    state.audit.some((event) => event.action === "consumer_case.created") &&
      state.audit.some(
        (event) => event.action === "consumer_case.refund_submitted",
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
      stripeCustomerOwnershipVerified: true,
      stripeSubscriptionInvoiceVerified: true,
      stripeRefundIdempotent: true,
      stripeCompletionProviderVerified: true,
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
