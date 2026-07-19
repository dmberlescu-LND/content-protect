import assert from "node:assert/strict";
import { backupTiersForDate } from "../backup-schedule.mjs";

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

console.log(
  JSON.stringify({
    ok: true,
    dailyUsesUtc: true,
    monthlyRunsOnUtcDayOne: true,
    manualMonthlySupported: true,
  }),
);
