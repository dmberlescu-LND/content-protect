import assert from "node:assert/strict";
import {
  operationsReadiness,
  REQUIRED_MIGRATION,
} from "../operations-readiness.mjs";

const complete = {
  database: {
    ok: true,
    mode: "postgresql",
    latestMigration: REQUIRED_MIGRATION,
  },
  storage: { ok: true, mode: "private-object-storage" },
  hasExternalMasterKey: true,
  scanner: "tineye-commercial",
  takedownDeliveryConfigured: true,
  stripeConfigured: true,
  yotiConfigured: true,
  retentionAutomationConfigured: true,
  monitoringConfigured: true,
  backupRestoreVerifiedAt: new Date().toISOString(),
};

assert.deepEqual(operationsReadiness(complete), {
  infrastructureReady: true,
  productionReady: true,
  operationalGates: {
    scanner: true,
    takedownDelivery: true,
    billing: true,
    ageVerification: true,
    retentionAutomation: true,
    monitoring: true,
    backupRestore: true,
  },
});

for (const unsafe of [
  { database: { ok: true, mode: "local-json" } },
  { storage: { ok: true, mode: "encrypted-local-disk" } },
  { hasExternalMasterKey: false },
  {
    database: {
      ok: true,
      mode: "postgresql",
      latestMigration: "011_asset_media_validation.sql",
    },
  },
]) {
  assert.equal(
    operationsReadiness({ ...complete, ...unsafe }).infrastructureReady,
    false,
  );
}

for (const missingGate of [
  { scanner: "unconfigured" },
  { takedownDeliveryConfigured: false },
  { stripeConfigured: false },
  { yotiConfigured: false },
  { retentionAutomationConfigured: false },
  { monitoringConfigured: false },
  { backupRestoreVerifiedAt: "2020-01-01T00:00:00.000Z" },
]) {
  const result = operationsReadiness({ ...complete, ...missingGate });
  assert.equal(result.infrastructureReady, true);
  assert.equal(result.productionReady, false);
}

console.log(
  JSON.stringify({
    ok: true,
    failClosedInfrastructure: true,
    completeCommercialGate: true,
    restoreEvidenceExpiry: true,
  }),
);
