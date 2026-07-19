import assert from "node:assert/strict";
import {
  backupRestoreDrillDue,
  backupTiersForDate,
} from "../backup-schedule.mjs";

assert.deepEqual(backupTiersForDate("2026-07-19T02:47:00Z"), ["daily"]);
assert.deepEqual(backupTiersForDate("2026-08-01T02:47:00Z"), [
  "daily",
  "monthly",
]);
assert.deepEqual(
  backupTiersForDate("2026-07-19T02:47:00Z", { forceMonthly: true }),
  ["daily", "monthly"],
);
assert.throws(() => backupTiersForDate("not-a-date"), /Invalid backup date/);
assert.equal(
  backupRestoreDrillDue("2026-07-19T02:47:00Z", {
    verifiedRecently: true,
  }),
  false,
);
assert.equal(
  backupRestoreDrillDue("2026-07-19T02:47:00Z", {
    verifiedRecently: false,
  }),
  true,
);
assert.equal(
  backupRestoreDrillDue("2026-10-01T02:47:00Z", {
    verifiedRecently: true,
  }),
  true,
);
assert.equal(
  backupRestoreDrillDue("2026-07-19T02:47:00Z", {
    verifiedRecently: true,
    force: true,
  }),
  true,
);
assert.throws(() => backupRestoreDrillDue("not-a-date"), /Invalid backup date/);

console.log(
  JSON.stringify({
    ok: true,
    dailyUsesUtc: true,
    monthlyRunsOnUtcDayOne: true,
    manualMonthlySupported: true,
    missingEvidenceTriggersRestore: true,
    quarterlyRestoreUsesUtc: true,
    manualRestoreSupported: true,
  }),
);
