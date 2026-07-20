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

export class StripeSubscriptionPolicyError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.name = "StripeSubscriptionPolicyError";
    this.status = status;
  }
}

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
  const metadata = subscription?.metadata || {},
    metadataUserId = metadata.userId || null,
    userId = metadataUserId || fallbackUserId || null,
    consentId = metadata.consentId || null,
    consentTermsVersion = metadata.termsVersion || null,
    metadataMatches = Boolean(
      metadataUserId &&
      metadata.plan === plan &&
      metadata.priceId === priceId &&
      metadata.mode === paymentsMode &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(consentId || ""),
      ) &&
      /^[A-Za-z0-9._-]{6,80}$/.test(String(consentTermsVersion || "")),
    );
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
    modeMatches &&
    metadataMatches,
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
    consentId,
    consentTermsVersion,
    renewalAt: periodEnd
      ? new Date(Number(periodEnd) * 1000).toISOString()
      : null,
    entitled: Boolean(valid && ["active", "trialing"].includes(status)),
  };
}

export function billingConsentAuthorizesSubscription(
  consent,
  { consentId, userId, plan, termsVersion, checkoutSessionId = null },
) {
  return Boolean(
    consent &&
    consent.id === consentId &&
    consent.userId === userId &&
    consent.plan === plan &&
    consent.termsVersion === termsVersion &&
    consent.immediateServiceRequested === true &&
    consent.coolingOffAcknowledged === true &&
    (!checkoutSessionId ||
      consent.stripeCheckoutSessionId === checkoutSessionId),
  );
}

export function checkoutSessionAuthorizesSubscription(
  session,
  reconciledSubscription,
) {
  const metadata = session?.metadata || {};
  return Boolean(
    session?.object === "checkout.session" &&
    session.status === "complete" &&
    stripeSubscriptionId(session) ===
      reconciledSubscription?.stripeSubscriptionId &&
    Boolean(session.livemode) ===
      Boolean(reconciledSubscription?.stripeLivemode) &&
    metadata.userId === reconciledSubscription?.userId &&
    metadata.plan === reconciledSubscription?.plan &&
    metadata.priceId === reconciledSubscription?.stripePriceId &&
    metadata.consentId === reconciledSubscription?.consentId &&
    metadata.termsVersion === reconciledSubscription?.consentTermsVersion &&
    metadata.mode ===
      (reconciledSubscription?.stripeLivemode ? "live" : "test"),
  );
}

export function stripeSubscriptionBlocksCheckout(subscription) {
  return Boolean(
    subscription?.stripeSubscriptionId &&
    !["canceled", "incomplete_expired"].includes(subscription.status),
  );
}

export function validateStripeSubscriptionForAccount(
  subscription,
  {
    expectedSubscriptionId,
    expectedCustomerId,
    paymentsMode,
    requireEnded = false,
  },
) {
  const customerId =
    typeof subscription?.customer === "string"
      ? subscription.customer
      : subscription?.customer?.id || null;
  if (
    subscription?.object !== "subscription" ||
    !/^sub_[A-Za-z0-9]+$/.test(String(expectedSubscriptionId || "")) ||
    subscription.id !== expectedSubscriptionId
  )
    throw new StripeSubscriptionPolicyError(
      "Stripe returned a different subscription.",
    );
  if (
    !/^cus_[A-Za-z0-9]+$/.test(String(expectedCustomerId || "")) ||
    customerId !== expectedCustomerId
  )
    throw new StripeSubscriptionPolicyError(
      "Stripe returned a subscription for another customer.",
    );
  if (Boolean(subscription.livemode) !== (paymentsMode === "live"))
    throw new StripeSubscriptionPolicyError(
      "Stripe subscription mode does not match the application.",
    );
  const ended = ["canceled", "incomplete_expired"].includes(
    subscription.status,
  );
  if (requireEnded && !ended)
    throw new StripeSubscriptionPolicyError(
      "Stripe has not confirmed that recurring billing has ended.",
    );
  return {
    subscriptionId: subscription.id,
    customerId,
    status: subscription.status,
    canceled: subscription.status === "canceled",
    ended,
  };
}

export function validateStripePostCancellationBillingState(
  { pendingInvoiceItems, openInvoices, draftInvoices },
  { expectedSubscriptionId, expectedCustomerId, paymentsMode },
) {
  if (!/^sub_[A-Za-z0-9]+$/.test(String(expectedSubscriptionId || "")))
    throw new StripeSubscriptionPolicyError(
      "The Stripe subscription identifier is invalid.",
      400,
    );
  if (!/^cus_[A-Za-z0-9]+$/.test(String(expectedCustomerId || "")))
    throw new StripeSubscriptionPolicyError(
      "The Stripe customer identifier is invalid.",
      400,
    );
  for (const [label, list] of [
    ["pending invoice items", pendingInvoiceItems],
    ["open invoices", openInvoices],
    ["draft invoices", draftInvoices],
  ]) {
    if (
      list?.object !== "list" ||
      !Array.isArray(list.data) ||
      list.has_more !== false
    )
      throw new StripeSubscriptionPolicyError(
        `Stripe returned an incomplete list of ${label}.`,
        502,
      );
  }
  if (pendingInvoiceItems.data.length)
    throw new StripeSubscriptionPolicyError(
      "Stripe reports pending invoice items that require billing support review after cancellation.",
    );
  const expectedLiveMode = paymentsMode === "live";
  for (const [expectedStatus, list] of [
    ["open", openInvoices],
    ["draft", draftInvoices],
  ])
    for (const invoice of list.data) {
      const customerId =
        typeof invoice?.customer === "string"
          ? invoice.customer
          : invoice?.customer?.id || null;
      if (
        invoice?.object !== "invoice" ||
        invoice.status !== expectedStatus ||
        customerId !== expectedCustomerId ||
        stripeSubscriptionId(invoice) !== expectedSubscriptionId ||
        Boolean(invoice.livemode) !== expectedLiveMode ||
        invoice.auto_advance !== false
      )
        throw new StripeSubscriptionPolicyError(
          "Stripe has an open or draft subscription invoice that is not safely paused.",
        );
    }
  return {
    pendingInvoiceItems: 0,
    pausedOpenInvoices: openInvoices.data.length,
    pausedDraftInvoices: draftInvoices.data.length,
  };
}

export function checkoutIdempotencyKey(userId, plan, now = Date.now()) {
  const window = Math.floor(now / (30 * 60 * 1000));
  return `content-protect-checkout:${userId}:${plan}:${window}`;
}
