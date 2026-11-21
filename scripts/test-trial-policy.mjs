import assert from "node:assert/strict";
import {
  TRIAL_DURATION_DAYS,
  TRIAL_PLAN_ORDER,
  trialAdmission,
  trialAccessForUser,
  trialConfiguration,
  trialEntitlements,
  trialSchedule,
} from "../trial-policy.mjs";

const start = "2026-12-01T00:00:00.000Z";
const day = 86_400_000;

assert.deepEqual(TRIAL_PLAN_ORDER, ["Monitor", "Protect", "Pro"]);
assert.equal(TRIAL_DURATION_DAYS, 30);
assert.equal(trialSchedule("not-a-date", start).enabled, false);

const first = trialSchedule(start, new Date(start).getTime() + day);
assert.equal(first.activePlan, "Monitor");
assert.deepEqual(first.phases.map((phase) => phase.status), ["active", "scheduled", "scheduled"]);

const second = trialSchedule(start, new Date(start).getTime() + 31 * day);
assert.equal(second.activePlan, "Protect");
assert.deepEqual(second.phases.map((phase) => phase.status), ["ended", "active", "scheduled"]);

const afterAll = trialSchedule(start, new Date(start).getTime() + 91 * day);
assert.equal(afterAll.activePlan, null);
assert.equal(afterAll.expired, true);

assert.equal(trialEntitlements("Protect").trial, true);
assert.equal(trialEntitlements("Protect").providerScanning, false);
assert.equal(trialEntitlements("Protect").billing, false);
assert.equal(trialEntitlements("Unknown"), null);

assert.deepEqual(trialAdmission({}), { allowed: false, reason: "invitation-required" });
assert.deepEqual(
  trialAdmission({ invited: true, emailVerified: true, ageVerified: true, rightsDeclared: true }),
  { allowed: true, reason: null },
);
assert.equal(
  trialAdmission({ invited: true, emailVerified: true, ageVerified: true, rightsDeclared: false }).allowed,
  false,
);

assert.equal(trialConfiguration({}).enabled, false);
assert.equal(
  trialConfiguration({ CONTENT_PROTECT_TRIAL_MODE: "unknown" }).reason,
  "invalid-mode",
);
const environment = {
  CONTENT_PROTECT_TRIAL_MODE: "luxandra-sequential",
  CONTENT_PROTECT_TRIAL_CREATOR_EMAIL: "luxandra@example.test",
  CONTENT_PROTECT_TRIAL_START_AT: start,
};
const trialUser = {
  email: "Luxandra@Example.Test",
  emailVerifiedAt: start,
  ageVerifiedAt: start,
  trialRightsDeclaredAt: start,
};
assert.equal(
  trialAccessForUser(trialUser, { environment, now: new Date(start).getTime() + day }).status,
  "eligible",
);
assert.equal(
  trialAccessForUser({ ...trialUser, email: "other@example.test" }, { environment, now: start }),
  null,
);
assert.equal(
  trialAccessForUser({ ...trialUser, trialRightsDeclaredAt: null }, { environment, now: start }).status,
  "blocked",
);

console.log(JSON.stringify({
  ok: true,
  sequentialPhases: 3,
  durationDays: TRIAL_DURATION_DAYS,
  noBilling: true,
  noProviderScanning: true,
  admissionFailClosed: true,
  featureFlagDefaultOff: true,
  invitationBound: true,
}));
