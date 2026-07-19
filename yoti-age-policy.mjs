export const YOTI_SESSION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const APPROVED_METHODS = new Set([
  "AGE_ESTIMATION",
  "DIGITAL_ID",
  "DOC_SCAN",
]);

export function buildYotiAgeSession({ userId, baseUrl }) {
  return {
    type: "OVER",
    ttl: 900,
    reference_id: userId,
    digital_id: {
      allowed: true,
      threshold: 18,
      age_estimation_allowed: true,
      age_estimation_threshold: 21,
      retry_limit: 2,
    },
    doc_scan: {
      allowed: true,
      threshold: 18,
      authenticity: "AUTO",
      level: "PASSIVE",
      retry_limit: 2,
    },
    age_estimation: {
      allowed: true,
      threshold: 21,
      level: "PASSIVE",
      retry_limit: 2,
    },
    callback: { auto: true, url: `${baseUrl}/?age_check=return` },
    cancel_url: `${baseUrl}/?age_check=cancelled`,
    privacy_policy: `${baseUrl}/privacy.html`,
    terms_and_conditions: `${baseUrl}/terms.html`,
    retry_enabled: true,
    resume_enabled: true,
    synchronous_checks: true,
  };
}

export function interpretYotiAgeResult(result, { sessionId, userId, sdkId }) {
  const identityMatches = Boolean(
    result &&
      result.id === sessionId &&
      result.reference_id === userId &&
      result.sdk_id === sdkId &&
      result.type === "OVER",
  );
  if (!identityMatches) return { accepted: false, status: "mismatch" };

  const providerStatus = String(result.status || "").toUpperCase();
  const method = String(result.method || "").toUpperCase();
  const accepted = Boolean(
    providerStatus === "COMPLETE" &&
      APPROVED_METHODS.has(method) &&
      Number.isInteger(result.age) &&
      result.age >= 18,
  );
  const status = accepted
    ? "verified"
    : ["PENDING", "IN_PROGRESS"].includes(providerStatus)
      ? "pending"
      : providerStatus === "EXPIRED"
        ? "expired"
        : "failed";
  return { accepted, status, method: method || "UNKNOWN", providerStatus };
}
