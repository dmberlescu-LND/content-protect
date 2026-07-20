import assert from "node:assert/strict";
import {
  billingConsentAuthorizesSubscription,
  checkoutSessionAuthorizesSubscription,
  checkoutIdempotencyKey,
  reconcileStripeSubscription,
  stripeSubscriptionBlocksCheckout,
  stripeSubscriptionId,
  validateStripePostCancellationBillingState,
  validateStripeSubscriptionForAccount,
} from "../stripe-subscription-policy.mjs";

const prices = {
  Monitor: "price_monitor",
  Protect: "price_protect",
  Pro: "price_pro",
};
const subscription = {
  id: "sub_123",
  object: "subscription",
  customer: "cus_123",
  livemode: false,
  status: "active",
  metadata: {
    userId: "user-123",
    plan: "Protect",
    priceId: "price_protect",
    mode: "test",
    consentId: "11111111-1111-4111-8111-111111111111",
    termsVersion: "2026-07-19-v1.1",
  },
  items: {
    data: [{ price: { id: "price_protect" }, current_period_end: 1780000000 }],
  },
};

assert.equal(stripeSubscriptionId(subscription), "sub_123");
assert.equal(
  stripeSubscriptionId({ subscription: "sub_invoice" }),
  "sub_invoice",
);
assert.equal(
  stripeSubscriptionId({
    parent: { subscription_details: { subscription: "sub_parent" } },
  }),
  "sub_parent",
);

const reconciled = reconcileStripeSubscription(subscription, {
  prices,
  paymentsMode: "test",
});
assert.equal(reconciled.valid, true);
assert.equal(reconciled.entitled, true);
assert.equal(reconciled.plan, "Protect");
assert.equal(reconciled.consentId, subscription.metadata.consentId);
assert.equal(reconciled.renewalAt, "2026-05-28T20:26:40.000Z");

for (const unsafe of [
  { status: "past_due" },
  { livemode: true },
  { items: { data: [{ price: { id: "price_unknown" } }] } },
  { customer: null },
  { metadata: {} },
  { metadata: { ...subscription.metadata, priceId: "price_other" } },
  { metadata: { ...subscription.metadata, mode: "live" } },
  { metadata: { ...subscription.metadata, consentId: "not-a-uuid" } },
]) {
  const result = reconcileStripeSubscription(
    { ...subscription, ...unsafe },
    { prices, paymentsMode: "test" },
  );
  assert.equal(result.entitled, false);
}

const consent = {
  id: subscription.metadata.consentId,
  userId: "user-123",
  plan: "Protect",
  termsVersion: subscription.metadata.termsVersion,
  immediateServiceRequested: true,
  coolingOffAcknowledged: true,
  stripeCheckoutSessionId: "cs_test_verified123",
};
const checkoutSession = {
  id: "cs_test_verified123",
  object: "checkout.session",
  status: "complete",
  livemode: false,
  subscription: subscription.id,
  metadata: { ...subscription.metadata },
};
assert.equal(
  checkoutSessionAuthorizesSubscription(checkoutSession, reconciled),
  true,
);
for (const unsafeCheckout of [
  { ...checkoutSession, status: "open" },
  { ...checkoutSession, subscription: "sub_other123" },
  { ...checkoutSession, livemode: true },
  {
    ...checkoutSession,
    metadata: { ...checkoutSession.metadata, consentId: "another-consent" },
  },
])
  assert.equal(
    checkoutSessionAuthorizesSubscription(unsafeCheckout, reconciled),
    false,
  );
assert.equal(
  billingConsentAuthorizesSubscription(consent, {
    consentId: reconciled.consentId,
    userId: reconciled.userId,
    plan: reconciled.plan,
    termsVersion: reconciled.consentTermsVersion,
    checkoutSessionId: "cs_test_verified123",
  }),
  true,
);
for (const unsafeConsent of [
  { ...consent, immediateServiceRequested: false },
  { ...consent, coolingOffAcknowledged: false },
  { ...consent, termsVersion: "different-version" },
  { ...consent, plan: "Pro" },
  { ...consent, stripeCheckoutSessionId: "cs_test_other" },
])
  assert.equal(
    billingConsentAuthorizesSubscription(unsafeConsent, {
      consentId: reconciled.consentId,
      userId: reconciled.userId,
      plan: reconciled.plan,
      termsVersion: reconciled.consentTermsVersion,
      checkoutSessionId: "cs_test_verified123",
    }),
    false,
  );

const canceledSubscription = {
  id: "sub_verified123",
  object: "subscription",
  customer: "cus_verified123",
  livemode: false,
  status: "canceled",
};
assert.equal(
  validateStripeSubscriptionForAccount(canceledSubscription, {
    expectedSubscriptionId: "sub_verified123",
    expectedCustomerId: "cus_verified123",
    paymentsMode: "test",
    requireEnded: true,
  }).canceled,
  true,
);
assert.equal(
  validateStripeSubscriptionForAccount(
    { ...canceledSubscription, status: "incomplete_expired" },
    {
      expectedSubscriptionId: "sub_verified123",
      expectedCustomerId: "cus_verified123",
      paymentsMode: "test",
      requireEnded: true,
    },
  ).ended,
  true,
);
for (const unsafeSubscription of [
  { ...canceledSubscription, id: "sub_other123" },
  { ...canceledSubscription, customer: "cus_other123" },
  { ...canceledSubscription, livemode: true },
  { ...canceledSubscription, status: "active" },
])
  assert.throws(
    () =>
      validateStripeSubscriptionForAccount(unsafeSubscription, {
        expectedSubscriptionId: "sub_verified123",
        expectedCustomerId: "cus_verified123",
        paymentsMode: "test",
        requireEnded: true,
      }),
    /different subscription|another customer|mode does not match|not confirmed/i,
  );

for (const status of [
  "unverified",
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "paused",
])
  assert.equal(
    stripeSubscriptionBlocksCheckout({
      stripeSubscriptionId: "sub_verified123",
      status,
    }),
    true,
  );
for (const status of ["canceled", "incomplete_expired"])
  assert.equal(
    stripeSubscriptionBlocksCheckout({
      stripeSubscriptionId: "sub_verified123",
      status,
    }),
    false,
  );
assert.equal(stripeSubscriptionBlocksCheckout(null), false);

const emptyList = { object: "list", data: [], has_more: false },
  safelyPausedInvoice = {
    id: "in_verified123",
    object: "invoice",
    customer: "cus_verified123",
    subscription: "sub_verified123",
    livemode: false,
    status: "open",
    auto_advance: false,
  };
assert.deepEqual(
  validateStripePostCancellationBillingState(
    {
      pendingInvoiceItems: emptyList,
      openInvoices: {
        object: "list",
        data: [safelyPausedInvoice],
        has_more: false,
      },
      draftInvoices: emptyList,
    },
    {
      expectedSubscriptionId: "sub_verified123",
      expectedCustomerId: "cus_verified123",
      paymentsMode: "test",
    },
  ),
  {
    pendingInvoiceItems: 0,
    pausedOpenInvoices: 1,
    pausedDraftInvoices: 0,
  },
);
for (const unsafeBillingState of [
  {
    pendingInvoiceItems: {
      object: "list",
      data: [{ id: "ii_pending123", object: "invoiceitem" }],
      has_more: false,
    },
    openInvoices: emptyList,
    draftInvoices: emptyList,
  },
  {
    pendingInvoiceItems: { ...emptyList, has_more: true },
    openInvoices: emptyList,
    draftInvoices: emptyList,
  },
  {
    pendingInvoiceItems: emptyList,
    openInvoices: {
      object: "list",
      data: [{ ...safelyPausedInvoice, auto_advance: true }],
      has_more: false,
    },
    draftInvoices: emptyList,
  },
  {
    pendingInvoiceItems: emptyList,
    openInvoices: {
      object: "list",
      data: [{ ...safelyPausedInvoice, customer: "cus_other123" }],
      has_more: false,
    },
    draftInvoices: emptyList,
  },
])
  assert.throws(
    () =>
      validateStripePostCancellationBillingState(unsafeBillingState, {
        expectedSubscriptionId: "sub_verified123",
        expectedCustomerId: "cus_verified123",
        paymentsMode: "test",
      }),
    /pending invoice|incomplete list|not safely paused/i,
  );

const firstKey = checkoutIdempotencyKey("user-123", "Protect", 1800000);
assert.equal(
  firstKey,
  checkoutIdempotencyKey("user-123", "Protect", 1800000 + 120000),
);
assert.notEqual(
  firstKey,
  checkoutIdempotencyKey("user-123", "Protect", 3600000),
);

console.log(
  JSON.stringify({
    ok: true,
    authoritativeSubscriptionState: true,
    priceAndModeBound: true,
    retainedConsentBound: true,
    checkoutSessionMetadataBound: true,
    accountDeletionCancellationPolicyValidated: true,
    postCancellationBillingStateValidated: true,
    duplicateCheckoutBlocked: true,
    inactiveAccessRevoked: true,
    checkoutIdempotencyWindow: true,
  }),
);
