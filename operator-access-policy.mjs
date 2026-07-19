import { normaliseTotpSecret, validTotp, validTotpSecret } from "./totp.mjs";

const OPERATOR_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;

export function operatorAccessConfiguration(env = process.env) {
  const id = String(env.TAKEDOWN_OPERATOR_ID || "").trim(),
    token = String(env.TAKEDOWN_OPERATOR_TOKEN || ""),
    totpSecret = normaliseTotpSecret(env.TAKEDOWN_OPERATOR_TOTP_SECRET),
    configured = Boolean(
      OPERATOR_ID.test(id) && token.length >= 32 && validTotpSecret(totpSecret),
    ),
    configuration = {
      configured,
      id: configured ? id : null,
      reason: configured ? null : "incomplete-or-invalid",
    };
  if (configured)
    Object.defineProperties(configuration, {
      token: { value: token, enumerable: false },
      totpSecret: { value: totpSecret, enumerable: false },
    });
  return Object.freeze(configuration);
}

export function operatorTotpValid(
  configuration,
  value,
  timestamp = Date.now(),
) {
  return Boolean(
    configuration?.configured &&
    validTotp(configuration.totpSecret, value, timestamp),
  );
}

export function operatorActorSubject(configuration) {
  if (!configuration?.configured)
    throw new Error("Operator access is not configured.");
  return `operator:${configuration.id}`;
}
