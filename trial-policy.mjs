import { PLAN_ENTITLEMENTS } from "./billing-policy.mjs";

export const TRIAL_PLAN_ORDER = Object.freeze(["Monitor", "Protect", "Pro"]);
export const TRIAL_DURATION_DAYS = 30;
const DAY_MS = 86_400_000;

function normaliseEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * Build a deterministic, sequential plan-trial schedule. This policy never
 * creates a subscription, never enables billing and never overlaps plans.
 */
export function trialSchedule(startAt, now = new Date()) {
  const start = validDate(startAt), current = validDate(now);
  if (!start || !current) return { enabled: false, reason: "invalid-date" };

  const phases = TRIAL_PLAN_ORDER.map((plan, index) => {
    const phaseStart = new Date(start.getTime() + index * TRIAL_DURATION_DAYS * DAY_MS);
    const phaseEnd = new Date(phaseStart.getTime() + TRIAL_DURATION_DAYS * DAY_MS);
    return Object.freeze({
      plan,
      startsAt: phaseStart.toISOString(),
      endsAt: phaseEnd.toISOString(),
      status:
        current < phaseStart ? "scheduled" : current < phaseEnd ? "active" : "ended",
    });
  });
  const active = phases.find((phase) => phase.status === "active") || null;
  return Object.freeze({
    enabled: true,
    startsAt: start.toISOString(),
    endsAt: phases.at(-1).endsAt,
    activePlan: active?.plan || null,
    phases: Object.freeze(phases),
    expired: current >= new Date(phases.at(-1).endsAt),
  });
}

/**
 * Trial entitlements deliberately expose product limits only. Provider
 * scanning, payments and external notices remain disabled until their own
 * approved gates are green.
 */
export function trialEntitlements(plan) {
  const base = PLAN_ENTITLEMENTS[plan];
  if (!base) return null;
  return Object.freeze({
    ...base,
    trial: true,
    providerScanning: false,
    billing: false,
    externalNoticeDelivery: false,
  });
}

export function trialAdmission({ invited, emailVerified, ageVerified, rightsDeclared } = {}) {
  if (invited !== true) return { allowed: false, reason: "invitation-required" };
  if (emailVerified !== true) return { allowed: false, reason: "email-verification-required" };
  if (ageVerified !== true) return { allowed: false, reason: "age-verification-required" };
  if (rightsDeclared !== true) return { allowed: false, reason: "rights-declaration-required" };
  return { allowed: true, reason: null };
}

/**
 * Production configuration is deliberately off unless all values are
 * explicitly supplied. A missing or malformed invitation can never expose a
 * trial entitlement.
 */
export function trialConfiguration(environment = process.env) {
  const mode = String(environment.CONTENT_PROTECT_TRIAL_MODE || "")
    .trim()
    .toLowerCase();
  if (!mode || mode === "off" || mode === "disabled")
    return Object.freeze({ mode: "disabled", enabled: false, reason: "disabled" });
  if (mode !== "luxandra-sequential")
    return Object.freeze({ mode: "invalid", enabled: false, reason: "invalid-mode" });
  const creatorEmail = normaliseEmail(environment.CONTENT_PROTECT_TRIAL_CREATOR_EMAIL);
  const startAt = validDate(environment.CONTENT_PROTECT_TRIAL_START_AT);
  if (!creatorEmail || !startAt)
    return Object.freeze({ mode, enabled: false, reason: "missing-invitation-config" });
  return Object.freeze({
    mode,
    enabled: true,
    reason: null,
    creatorEmail,
    startAt: startAt.toISOString(),
  });
}

export function trialAccessForUser(
  user,
  { environment = process.env, now = new Date(), rightsDeclared = false } = {},
) {
  const config = trialConfiguration(environment);
  if (!config.enabled) return null;
  if (normaliseEmail(user?.email) !== config.creatorEmail) return null;
  const schedule = trialSchedule(config.startAt, now);
  if (!schedule.enabled || schedule.expired) return { ...schedule, activePlan: null, status: "expired" };
  const admission = trialAdmission({
    invited: true,
    emailVerified: Boolean(user?.emailVerifiedAt),
    ageVerified: Boolean(user?.ageVerifiedAt),
    rightsDeclared: rightsDeclared === true || Boolean(user?.trialRightsDeclaredAt),
  });
  return Object.freeze({
    ...schedule,
    status: admission.allowed ? "eligible" : "blocked",
    admission,
    // This remains a preview entitlement until the provider and legal gates
    // are separately approved; it must not be treated as a Stripe subscription.
    entitlement: schedule.activePlan ? trialEntitlements(schedule.activePlan) : null,
  });
}
