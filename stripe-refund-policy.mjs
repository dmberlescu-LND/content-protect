const PAYMENT_INTENT = /^pi_[A-Za-z0-9]+$/;
const REFUND = /^re_[A-Za-z0-9]+$/;
const REFUND_STATUSES = new Set([
  "pending",
  "requires-action",
  "succeeded",
  "failed",
  "canceled",
]);

export class StripeRefundPolicyError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.name = "StripeRefundPolicyError";
    this.status = status;
  }
}

function stripeId(value, expression, label) {
  const id = String(value || "");
  if (!expression.test(id))
    throw new StripeRefundPolicyError(`${label} is invalid.`, 400);
  return id;
}

function wholePence(value) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100_000_000)
    throw new StripeRefundPolicyError(
      "The approved refund amount must be whole pence.",
      400,
    );
  return amount;
}

function objectId(value) {
  if (typeof value === "string") return value;
  return value?.id || null;
}

function localRefundStatus(value) {
  const status = String(value || "").replaceAll("_", "-");
  if (!REFUND_STATUSES.has(status))
    throw new StripeRefundPolicyError(
      "Stripe returned an unsupported refund status.",
      502,
    );
  return status;
}

export function validateStripeRefundPaymentIntent(
  paymentIntent,
  { expectedCustomerId, paymentsMode, amountPence, existingRefundPence = 0 },
) {
  const id = stripeId(paymentIntent?.id, PAYMENT_INTENT, "Payment intent");
  if (paymentIntent?.object !== "payment_intent")
    throw new StripeRefundPolicyError(
      "Stripe did not return a payment intent.",
      502,
    );
  if (!/^cus_[A-Za-z0-9]+$/.test(String(expectedCustomerId || "")))
    throw new StripeRefundPolicyError(
      "The customer has no verified Stripe billing identity.",
    );
  if (objectId(paymentIntent.customer) !== expectedCustomerId)
    throw new StripeRefundPolicyError(
      "The payment does not belong to this Content Protect customer.",
      403,
    );
  if (Boolean(paymentIntent.livemode) !== (paymentsMode === "live"))
    throw new StripeRefundPolicyError(
      "The payment and application Stripe modes do not match.",
    );
  if (paymentIntent.status !== "succeeded")
    throw new StripeRefundPolicyError(
      "Only a succeeded Stripe payment can be refunded.",
    );
  if (String(paymentIntent.currency || "").toLowerCase() !== "gbp")
    throw new StripeRefundPolicyError(
      "Only the GBP payment recorded for this service can be refunded.",
    );
  const amount = wholePence(amountPence),
    received = Number(paymentIntent.amount_received),
    charge = paymentIntent.latest_charge;
  if (!charge || typeof charge === "string" || charge.object !== "charge")
    throw new StripeRefundPolicyError(
      "Stripe payment evidence is incomplete; the latest charge must be expanded.",
      502,
    );
  const alreadyRefunded = Number(charge.amount_refunded || 0);
  if (
    !Number.isSafeInteger(received) ||
    received < 1 ||
    !Number.isSafeInteger(alreadyRefunded) ||
    alreadyRefunded < 0 ||
    alreadyRefunded > received
  )
    throw new StripeRefundPolicyError(
      "Stripe returned inconsistent payment totals.",
      502,
    );
  const allowedExisting = Number(existingRefundPence);
  if (
    !Number.isSafeInteger(allowedExisting) ||
    allowedExisting < 0 ||
    allowedExisting > amount
  )
    throw new StripeRefundPolicyError(
      "Existing refund allowance is invalid.",
      400,
    );
  const refundablePence = received - alreadyRefunded;
  if (amount > refundablePence + allowedExisting)
    throw new StripeRefundPolicyError(
      "The approved amount exceeds the remaining refundable payment balance.",
    );
  return {
    paymentIntentReference: id,
    chargeReference: stripeId(charge.id, /^ch_[A-Za-z0-9]+$/, "Charge"),
    amountPence: amount,
    receivedPence: received,
    alreadyRefundedPence: alreadyRefunded,
    refundablePence,
  };
}

export function validateStripeRefundResult(
  refund,
  { paymentIntentReference, amountPence },
) {
  const providerReference = stripeId(refund?.id, REFUND, "Refund"),
    expectedPaymentIntent = stripeId(
      paymentIntentReference,
      PAYMENT_INTENT,
      "Payment intent",
    ),
    actualPaymentIntent = objectId(refund?.payment_intent),
    expectedAmount = wholePence(amountPence);
  if (refund?.object !== "refund")
    throw new StripeRefundPolicyError("Stripe did not return a refund.", 502);
  if (actualPaymentIntent !== expectedPaymentIntent)
    throw new StripeRefundPolicyError(
      "The Stripe refund is bound to a different payment.",
      502,
    );
  if (Number(refund.amount) !== expectedAmount)
    throw new StripeRefundPolicyError(
      "The Stripe refund amount does not match the approved amount.",
      502,
    );
  if (String(refund.currency || "").toLowerCase() !== "gbp")
    throw new StripeRefundPolicyError(
      "The Stripe refund currency does not match the approved GBP payment.",
      502,
    );
  return {
    providerReference,
    paymentIntentReference: expectedPaymentIntent,
    amountPence: expectedAmount,
    providerStatus: localRefundStatus(refund.status),
    failureReason:
      typeof refund.failure_reason === "string"
        ? refund.failure_reason.slice(0, 120)
        : null,
  };
}

export function validateStripeRefundInvoiceBinding(
  invoicePayments,
  {
    paymentIntentReference,
    expectedCustomerId,
    expectedUserId,
    expectedPriceIds,
    paymentsMode,
    amountPence,
  },
) {
  const paymentIntentId = stripeId(
      paymentIntentReference,
      PAYMENT_INTENT,
      "Payment intent",
    ),
    amount = wholePence(amountPence),
    prices = new Set(
      (expectedPriceIds || []).filter((value) =>
        /^price_[A-Za-z0-9]+$/.test(String(value || "")),
      ),
    );
  if (!/^cus_[A-Za-z0-9]+$/.test(String(expectedCustomerId || "")))
    throw new StripeRefundPolicyError(
      "The customer has no verified Stripe billing identity.",
    );
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      String(expectedUserId || ""),
    )
  )
    throw new StripeRefundPolicyError(
      "The Content Protect account binding is invalid.",
      400,
    );
  if (!prices.size)
    throw new StripeRefundPolicyError(
      "No approved Content Protect Stripe prices are configured.",
      503,
    );
  const candidates = Array.isArray(invoicePayments?.data)
    ? invoicePayments.data.filter((item) => {
        const invoice = item?.invoice,
          metadata = invoice?.parent?.subscription_details?.metadata,
          paymentIntent = objectId(item?.payment?.payment_intent),
          customer = objectId(invoice?.customer),
          amountPaid = Number(item?.amount_paid);
        return Boolean(
          item?.object === "invoice_payment" &&
          item.status === "paid" &&
          Boolean(item.livemode) === (paymentsMode === "live") &&
          String(item.currency || "").toLowerCase() === "gbp" &&
          paymentIntent === paymentIntentId &&
          Number.isSafeInteger(amountPaid) &&
          amountPaid >= amount &&
          invoice?.object === "invoice" &&
          invoice.status === "paid" &&
          Boolean(invoice.livemode) === (paymentsMode === "live") &&
          String(invoice.currency || "").toLowerCase() === "gbp" &&
          customer === expectedCustomerId &&
          invoice.parent?.type === "subscription_details" &&
          metadata?.userId === expectedUserId &&
          metadata?.mode === paymentsMode &&
          prices.has(metadata?.priceId),
        );
      })
    : [];
  if (candidates.length !== 1)
    throw new StripeRefundPolicyError(
      "The payment is not uniquely bound to a paid Content Protect subscription invoice.",
      409,
    );
  const match = candidates[0],
    invoice = match.invoice,
    subscriptionReference = objectId(
      invoice.parent.subscription_details.subscription,
    );
  return {
    invoicePaymentReference: stripeId(
      match.id,
      /^inpay_[A-Za-z0-9]+$/,
      "Invoice payment",
    ),
    invoiceReference: stripeId(invoice.id, /^in_[A-Za-z0-9]+$/, "Invoice"),
    subscriptionReference: stripeId(
      subscriptionReference,
      /^sub_[A-Za-z0-9]+$/,
      "Subscription",
    ),
    amountPaidPence: Number(match.amount_paid),
  };
}

export function stripeRefundIdempotencyKey(caseId, decisionEventId, attempt) {
  if (!/^[0-9a-f-]{36}$/i.test(String(caseId || "")))
    throw new StripeRefundPolicyError("The consumer case is invalid.", 400);
  if (!/^[0-9a-f-]{36}$/i.test(String(decisionEventId || "")))
    throw new StripeRefundPolicyError(
      "A retained refund decision is required.",
      409,
    );
  const number = Number(attempt);
  if (!Number.isSafeInteger(number) || number < 1 || number > 20)
    throw new StripeRefundPolicyError(
      "The refund retry limit has been reached.",
    );
  return `content-protect-refund:${caseId}:${decisionEventId}:${number}`;
}
