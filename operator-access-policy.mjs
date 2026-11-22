import { normaliseTotpSecret, validTotp, validTotpSecret } from "./totp.mjs";
import { timingSafeEqual } from "node:crypto";

const OPERATOR_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;

export function operatorAccessConfiguration(env = process.env) {
  const id = String(env.TAKEDOWN_OPERATOR_ID || "").trim(),
    token = String(env.TAKEDOWN_OPERATOR_TOKEN || ""),
    passwordSalt = String(env.TAKEDOWN_OPERATOR_PASSWORD_SALT || "").trim(),
    passwordHash = String(env.TAKEDOWN_OPERATOR_PASSWORD_HASH || "").trim(),
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
      passwordSalt: { value: passwordSalt, enumerable: false },
      passwordHash: { value: passwordHash, enumerable: false },
      totpSecret: { value: totpSecret, enumerable: false },
    });
  return Object.freeze(configuration);
}

export function operatorPasswordValid(configuration, password, derive) {
  if (!configuration?.configured || typeof password !== "string") return false;
  const expected = String(configuration.passwordHash || "");
  if (!expected || !configuration.passwordSalt) return false;
  const candidate = derive(password, configuration.passwordSalt);
  if (!Buffer.isBuffer(candidate) || expected.length !== candidate.length * 2)
    return false;
  return timingSafeEqual(candidate, Buffer.from(expected, "hex"));
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
