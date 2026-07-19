import { spawnSync } from "node:child_process";

const checks = [
  "test-billing-policy.mjs",
  "test-audit-integrity.mjs",
  "test-audit-export-policy.mjs",
  "test-backup-restore-policy.mjs",
  "test-database-backup-policy.mjs",
  "test-backup-schedule.mjs",
  "test-isolated-restore-policy.mjs",
  "test-media-validation.mjs",
  "test-content-rights-policy.mjs",
  "test-dispute-policy.mjs",
  "test-dispute-integration.mjs",
  "test-page-capture-policy.mjs",
  "test-page-capture-integration.mjs",
  "test-video-frames.mjs",
  "test-media-backup-policy.mjs",
  "test-scanner.mjs",
  "test-operations-readiness.mjs",
  "test-security-policy.mjs",
  "test-distributed-rate-limit.mjs",
  "test-retention-queue.mjs",
  "test-yoti-age-policy.mjs",
  "test-yoti-sandbox-integration.mjs",
  "test-operator-access-policy.mjs",
  "test-operator-auth-integration.mjs",
  "test-takedown-policy.mjs",
  "test-stripe-subscription-policy.mjs",
  "test-storage-config.mjs",
  "verify-compliance.mjs",
];

for (const check of checks) {
  const result = spawnSync(process.execPath, [`scripts/${check}`], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(JSON.stringify({ ok: true, checks: checks.length }));
