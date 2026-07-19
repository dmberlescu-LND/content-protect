import assert from "node:assert/strict";
import {
  findActiveSubscription,
  planForPrice,
  scanIntervalMs,
} from "../billing-policy.mjs";

const prices = {
  Monitor: "price_monitor",
  Protect: "price_protect",
  Pro: "price_pro",
};
const base = {
  userId: "user-1",
  plan: "Protect",
  status: "active",
  mode: "stripe_test",
  stripeLivemode: false,
  stripePriceId: "price_protect",
};

assert.equal(
  findActiveSubscription([base], "user-1", {
    paymentsMode: "test",
    prices,
  }),
  base,
);
for (const invalid of [
  { ...base, status: "past_due" },
  { ...base, status: "cancelled" },
  { ...base, mode: "stripe_live" },
  { ...base, stripeLivemode: true },
  { ...base, stripePriceId: "price_other" },
  { ...base, plan: "Unknown" },
])
  assert.equal(
    findActiveSubscription([invalid], "user-1", {
      paymentsMode: "test",
      prices,
    }),
    undefined,
  );

assert.equal(planForPrice(prices, "price_monitor"), "Monitor");
assert.equal(planForPrice(prices, "price_other"), undefined);
assert.equal(scanIntervalMs("Monitor"), 30 * 86400000);
assert.equal(scanIntervalMs("Protect"), 86400000);
assert.equal(scanIntervalMs("Pro"), 86400000);

console.log(
  JSON.stringify({
    ok: true,
    activeSubscriptionGate: true,
    testLiveIsolation: true,
    pricePlanBinding: true,
    scanIntervals: true,
  }),
);
