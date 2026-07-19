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
  return plan === "Monitor" ? 30 * 86400000 : 86400000;
}

export function planForPrice(prices, priceId) {
  return Object.entries(prices).find(([, value]) => value === priceId)?.[0];
}
