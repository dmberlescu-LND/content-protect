import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  stripeRefundIdempotencyKey,
  validateStripeRefundInvoiceBinding,
  validateStripeRefundPaymentIntent,
  validateStripeRefundResult,
} from "../stripe-refund-policy.mjs";

const paymentIntent = {
    id: "pi_verifiedpayment123",
    object: "payment_intent",
    customer: "cus_verifiedcustomer123",
    livemode: false,
    status: "succeeded",
    currency: "gbp",
    amount_received: 2400,
    latest_charge: {
      id: "ch_verifiedcharge123",
      object: "charge",
      amount_refunded: 200,
    },
  },
  verifiedPayment = validateStripeRefundPaymentIntent(paymentIntent, {
    expectedCustomerId: "cus_verifiedcustomer123",
    paymentsMode: "test",
    amountPence: 1900,
  });

assert.equal(verifiedPayment.refundablePence, 2200);
assert.equal(verifiedPayment.amountPence, 1900);
assert.throws(
  () =>
    validateStripeRefundPaymentIntent(paymentIntent, {
      expectedCustomerId: "cus_someoneelse",
      paymentsMode: "test",
      amountPence: 1900,
    }),
  /does not belong/i,
);
assert.throws(
  () =>
    validateStripeRefundPaymentIntent(paymentIntent, {
      expectedCustomerId: "cus_verifiedcustomer123",
      paymentsMode: "live",
      amountPence: 1900,
    }),
  /modes do not match/i,
);
assert.throws(
  () =>
    validateStripeRefundPaymentIntent(paymentIntent, {
      expectedCustomerId: "cus_verifiedcustomer123",
      paymentsMode: "test",
      amountPence: 2300,
    }),
  /remaining refundable/i,
);

const verifiedRefund = validateStripeRefundResult(
  {
    id: "re_verifiedrefund123",
    object: "refund",
    payment_intent: "pi_verifiedpayment123",
    amount: 1900,
    currency: "gbp",
    status: "requires_action",
    failure_reason: null,
  },
  { paymentIntentReference: "pi_verifiedpayment123", amountPence: 1900 },
);
assert.equal(verifiedRefund.providerStatus, "requires-action");

const paidSubscriptionInvoicePayment = {
    id: "inpay_verifiedpayment123",
    object: "invoice_payment",
    amount_paid: 2400,
    currency: "gbp",
    livemode: false,
    status: "paid",
    payment: {
      type: "payment_intent",
      payment_intent: "pi_verifiedpayment123",
    },
    invoice: {
      id: "in_verifiedinvoice123",
      object: "invoice",
      customer: "cus_verifiedcustomer123",
      currency: "gbp",
      livemode: false,
      status: "paid",
      parent: {
        type: "subscription_details",
        subscription_details: {
          subscription: "sub_verifiedsubscription123",
          metadata: {
            userId: "11111111-1111-4111-8111-111111111111",
            mode: "test",
            priceId: "price_protect",
          },
        },
      },
    },
  },
  invoiceBindingOptions = {
    paymentIntentReference: "pi_verifiedpayment123",
    expectedCustomerId: "cus_verifiedcustomer123",
    expectedUserId: "11111111-1111-4111-8111-111111111111",
    expectedPriceIds: ["price_monitor", "price_protect", "price_pro"],
    paymentsMode: "test",
    amountPence: 1900,
  },
  invoiceBinding = validateStripeRefundInvoiceBinding(
    {
      data: [paidSubscriptionInvoicePayment],
    },
    invoiceBindingOptions,
  );
assert.equal(invoiceBinding.invoiceReference, "in_verifiedinvoice123");
assert.equal(
  invoiceBinding.subscriptionReference,
  "sub_verifiedsubscription123",
);
assert.throws(
  () =>
    validateStripeRefundInvoiceBinding(
      {
        data: [
          paidSubscriptionInvoicePayment,
          { ...paidSubscriptionInvoicePayment, id: "inpay_duplicate123" },
        ],
      },
      invoiceBindingOptions,
    ),
  /not uniquely bound/i,
);
for (const unsafeInvoicePayment of [
  {
    ...paidSubscriptionInvoicePayment,
    invoice: {
      ...paidSubscriptionInvoicePayment.invoice,
      customer: "cus_anothercustomer123",
    },
  },
  {
    ...paidSubscriptionInvoicePayment,
    invoice: {
      ...paidSubscriptionInvoicePayment.invoice,
      parent: {
        ...paidSubscriptionInvoicePayment.invoice.parent,
        subscription_details: {
          ...paidSubscriptionInvoicePayment.invoice.parent.subscription_details,
          metadata: {
            ...paidSubscriptionInvoicePayment.invoice.parent
              .subscription_details.metadata,
            userId: "22222222-2222-4222-8222-222222222222",
          },
        },
      },
    },
  },
  {
    ...paidSubscriptionInvoicePayment,
    invoice: {
      ...paidSubscriptionInvoicePayment.invoice,
      parent: {
        ...paidSubscriptionInvoicePayment.invoice.parent,
        subscription_details: {
          ...paidSubscriptionInvoicePayment.invoice.parent.subscription_details,
          metadata: {
            ...paidSubscriptionInvoicePayment.invoice.parent
              .subscription_details.metadata,
            priceId: "price_unapproved",
          },
        },
      },
    },
  },
  { ...paidSubscriptionInvoicePayment, amount_paid: 1800 },
  { ...paidSubscriptionInvoicePayment, invoice: "in_unexpanded123" },
])
  assert.throws(
    () =>
      validateStripeRefundInvoiceBinding(
        { data: [unsafeInvoicePayment] },
        invoiceBindingOptions,
      ),
    /not uniquely bound/i,
  );

const caseId = randomUUID(),
  decisionId = randomUUID(),
  key = stripeRefundIdempotencyKey(caseId, decisionId, 1);
assert.equal(key, stripeRefundIdempotencyKey(caseId, decisionId, 1));
assert.notEqual(key, stripeRefundIdempotencyKey(caseId, decisionId, 2));

console.log(
  JSON.stringify({
    ok: true,
    customerOwnershipBound: true,
    stripeModeBound: true,
    refundableBalanceEnforced: true,
    providerResultVerified: true,
    subscriptionInvoiceBound: true,
    retryIdempotencyBound: true,
  }),
);
