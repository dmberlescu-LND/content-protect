import assert from "node:assert/strict";
import {
  checkoutIdempotencyKey,
  reconcileStripeSubscription,
  stripeSubscriptionId,
} from "../stripe-subscription-policy.mjs";

const prices = { Monitor: "price_monitor", Protect: "price_protect", Pro: "price_pro" };
const subscription = {
  id: "sub_123",
  object: "subscription",
  customer: "cus_123",
  livemode: false,
  status: "active",
  metadata: { userId: "user-123" },
  items: {
    data: [
      { price: { id: "price_protect" }, current_period_end: 1780000000 },
    ],
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
assert.equal(reconciled.renewalAt, "2026-05-28T20:26:40.000Z");

for (const unsafe of [
  { status: "past_due" },
  { livemode: true },
  { items: { data: [{ price: { id: "price_unknown" } }] } },
  { customer: null },
  { metadata: {} },
]) {
  const result = reconcileStripeSubscription(
    { ...subscription, ...unsafe },
    { prices, paymentsMode: "test" },
  );
  assert.equal(result.entitled, false);
}

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
    inactiveAccessRevoked: true,
    checkoutIdempotencyWindow: true,
  }),
);
