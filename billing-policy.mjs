const DAY_MS = 86_400_000;

export const PLAN_ENTITLEMENTS = Object.freeze({
  Monitor: Object.freeze({
    assetLimit: 10,
    scanIntervalMs: 30 * DAY_MS,
    canCreateCases: false,
  }),
  Protect: Object.freeze({
    assetLimit: 25,
    scanIntervalMs: DAY_MS,
    canCreateCases: true,
  }),
  Pro: Object.freeze({
    assetLimit: 50,
    scanIntervalMs: DAY_MS,
    canCreateCases: true,
  }),
});

export function planEntitlements(plan) {
  return PLAN_ENTITLEMENTS[plan] || null;
}

export function assetLimitForPlan(plan) {
  return planEntitlements(plan)?.assetLimit || 0;
}

export function assetAllowance(plan, currentCount) {
  const limit = assetLimitForPlan(plan),
    used =
      Number.isInteger(currentCount) && currentCount >= 0
        ? currentCount
        : limit,
    remaining = Math.max(0, limit - used);
  return { limit, used, remaining, canAdd: limit > 0 && remaining > 0 };
}

export function findActiveSubscription(
  subscriptions,
  userId,
  { paymentsMode, prices },
) {
  return subscriptions.find(
    (item) =>
      item.userId === userId &&
      ["active", "trialing"].includes(item.status) &&
      item.mode === `stripe_${paymentsMode}` &&
      Boolean(item.stripeLivemode) === (paymentsMode === "live") &&
      Object.prototype.hasOwnProperty.call(prices, item.plan) &&
      item.stripePriceId === prices[item.plan],
  );
}

export function scanIntervalMs(plan) {
  return planEntitlements(plan)?.scanIntervalMs || 0;
}

export function planForPrice(prices, priceId) {
  return Object.entries(prices).find(([, value]) => value === priceId)?.[0];
}
