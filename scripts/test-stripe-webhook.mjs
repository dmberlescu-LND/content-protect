import Stripe from "stripe";
import { randomUUID } from "node:crypto";

const endpoint = process.env.TEST_STRIPE_WEBHOOK_URL || "http://127.0.0.1:8791/api/billing/webhook";
const secret = process.env.STRIPE_WEBHOOK_SECRET;
if (!secret?.startsWith("whsec_")) throw new Error("STRIPE_WEBHOOK_SECRET is required");

const stripe = new Stripe("sk_test_local_webhook_verification_only");
const eventId = `evt_${randomUUID().replaceAll("-", "")}`;
const payload = JSON.stringify({
  id: eventId,
  object: "event",
  type: "invoice.paid",
  livemode: false,
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: `in_${randomUUID().replaceAll("-", "")}`,
      object: "invoice",
      customer: `cus_${randomUUID().replaceAll("-", "")}`,
      metadata: {},
    },
  },
});
const signature = stripe.webhooks.generateTestHeaderString({
  payload,
  secret,
});

async function post(signatureValue) {
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signatureValue,
    },
    body: payload,
  });
}

const invalid = await post("t=1,v1=invalid");
if (invalid.status !== 400) throw new Error(`Expected invalid signature 400, got ${invalid.status}`);

const accepted = await post(signature);
if (accepted.status !== 200) throw new Error(`Expected valid event 200, got ${accepted.status}`);

const duplicate = await post(signature);
const duplicateBody = await duplicate.json();
if (duplicate.status !== 200 || duplicateBody.duplicate !== true)
  throw new Error("Expected duplicate Stripe event to be acknowledged once");

console.log("Stripe webhook signature, mode and deduplication: ok");
