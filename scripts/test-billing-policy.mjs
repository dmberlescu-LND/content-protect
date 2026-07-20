import assert from "node:assert/strict";
import {
  assetAllowance,
  assetLimitForPlan,
  findActiveSubscription,
  planEntitlements,
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
  billingConsentId: "11111111-1111-4111-8111-111111111111",
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
  { ...base, billingConsentId: null },
  { ...base, billingConsentId: "not-a-consent-id" },
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
assert.equal(scanIntervalMs("Unknown"), 0);
assert.equal(assetLimitForPlan("Monitor"), 10);
assert.equal(assetLimitForPlan("Protect"), 25);
assert.equal(assetLimitForPlan("Pro"), 50);
assert.equal(assetLimitForPlan("Unknown"), 0);
assert.equal(planEntitlements("Monitor").canCreateCases, false);
assert.equal(planEntitlements("Protect").canCreateCases, true);
assert.deepEqual(assetAllowance("Monitor", 9), {
  limit: 10,
  used: 9,
  remaining: 1,
  canAdd: true,
});
assert.deepEqual(assetAllowance("Monitor", 10), {
  limit: 10,
  used: 10,
  remaining: 0,
  canAdd: false,
});
assert.equal(assetAllowance("Unknown", 0).canAdd, false);
assert.equal(assetAllowance("Pro", -1).canAdd, false);

console.log(
  JSON.stringify({
    ok: true,
    activeSubscriptionGate: true,
    testLiveIsolation: true,
    pricePlanBinding: true,
    scanIntervals: true,
    enforcedAssetLimits: true,
    caseEntitlements: true,
  }),
);
