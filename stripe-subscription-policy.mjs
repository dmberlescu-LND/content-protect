export const STRIPE_SUBSCRIPTION_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
]);

export function stripeSubscriptionId(object) {
  if (object?.object === "subscription" && typeof object.id === "string")
    return object.id;
  if (typeof object?.subscription === "string") return object.subscription;
  if (typeof object?.subscription?.id === "string")
    return object.subscription.id;
  if (typeof object?.parent?.subscription_details?.subscription === "string")
    return object.parent.subscription_details.subscription;
  if (
    typeof object?.parent?.subscription_details?.subscription?.id === "string"
  )
    return object.parent.subscription_details.subscription.id;
  return null;
}

export function reconcileStripeSubscription(
  subscription,
  { prices, paymentsMode, fallbackUserId },
) {
  const priceId = subscription?.items?.data?.[0]?.price?.id || null;
  const plan = Object.entries(prices).find(([, id]) => id === priceId)?.[0];
  const livemode = Boolean(subscription?.livemode);
  const modeMatches = livemode === (paymentsMode === "live");
  const userId = subscription?.metadata?.userId || fallbackUserId || null;
  const periodEnd =
    subscription?.current_period_end ||
    subscription?.items?.data?.[0]?.current_period_end ||
    null;
  const status = String(subscription?.status || "unverified");
  const valid = Boolean(
    subscription?.id &&
      subscription?.customer &&
      userId &&
      plan &&
      modeMatches,
  );
  return {
    valid,
    userId,
    plan: plan || null,
    status,
    stripeLivemode: livemode,
    stripePriceId: priceId,
    stripeCustomerId:
      typeof subscription?.customer === "string"
        ? subscription.customer
        : subscription?.customer?.id || null,
    stripeSubscriptionId: subscription?.id || null,
    renewalAt: periodEnd
      ? new Date(Number(periodEnd) * 1000).toISOString()
      : null,
    entitled: Boolean(
      valid && ["active", "trialing"].includes(status),
    ),
  };
}

export function checkoutIdempotencyKey(userId, plan, now = Date.now()) {
  const window = Math.floor(now / (30 * 60 * 1000));
  return `content-protect-checkout:${userId}:${plan}:${window}`;
}
