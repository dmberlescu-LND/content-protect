import { Webhook } from "svix";
import { randomUUID } from "node:crypto";

const endpoint = process.env.TEST_WEBHOOK_URL || "http://127.0.0.1:8791/api/takedowns/webhook";
const secret = process.env.RESEND_WEBHOOK_SECRET;
if (!secret?.startsWith("whsec_")) throw new Error("RESEND_WEBHOOK_SECRET is required");

const id = `msg_${randomUUID()}`;
const timestamp = new Date();
const payload = JSON.stringify({
  type: "email.delivered",
  created_at: timestamp.toISOString(),
  data: { email_id: `email_${randomUUID()}` },
});
const signature = new Webhook(secret).sign(id, timestamp, payload);

async function post(signatureValue) {
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "svix-signature": signatureValue,
    },
    body: payload,
  });
}

const invalid = await post("v1,invalid");
if (invalid.status !== 400) throw new Error(`Expected invalid signature 400, got ${invalid.status}`);

const accepted = await post(signature);
if (accepted.status !== 200) throw new Error(`Expected valid event 200, got ${accepted.status}`);

const duplicate = await post(signature);
const duplicateBody = await duplicate.json();
if (duplicate.status !== 200 || duplicateBody.duplicate !== true)
  throw new Error("Expected duplicate event to be acknowledged without reprocessing");

console.log("Resend webhook signature and deduplication: ok");
