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
    auditIntegrity: { ok: true, mode: "hmac-sha256-chain-v1" },
  },
  storage: { ok: true, mode: "private-object-storage" },
  hasExternalMasterKey: true,
  scanner: "tineye-commercial",
  takedownDeliveryConfigured: true,
  takedownsMode: "live",
  stripeConfigured: true,
  stripeMode: "live",
  yotiConfigured: true,
  yotiMode: "live",
  retentionEvidence: {
    status: "succeeded",
    occurredAt: new Date().toISOString(),
  },
  monitoringEvidence: {
    status: "succeeded",
    occurredAt: new Date().toISOString(),
  },
  backupRestoreEvidence: {
    status: "succeeded",
    requiredMigration: REQUIRED_MIGRATION,
    occurredAt: new Date().toISOString(),
  },
  auditExportEvidence: {
    status: "succeeded",
    requiredMigration: REQUIRED_MIGRATION,
    occurredAt: new Date().toISOString(),
  },
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
    auditExport: true,
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
      auditIntegrity: { ok: true, mode: "hmac-sha256-chain-v1" },
    },
  },
  {
    database: {
      ok: true,
      mode: "postgresql",
      latestMigration: REQUIRED_MIGRATION,
      auditIntegrity: { ok: false, mode: "hmac-sha256-chain-v1" },
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
  { takedownsMode: "sandbox" },
  { stripeConfigured: false },
  { stripeMode: "test" },
  { yotiConfigured: false },
  { yotiMode: "sandbox" },
  { retentionEvidence: undefined },
  {
    retentionEvidence: {
      status: "failed",
      occurredAt: new Date().toISOString(),
    },
  },
  { monitoringEvidence: undefined },
  {
    retentionEvidence: {
      status: "succeeded",
      occurredAt: new Date(Date.now() - 37 * 60 * 60 * 1000).toISOString(),
    },
  },
  {
    monitoringEvidence: {
      status: "succeeded",
      occurredAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
    },
  },
  {
    backupRestoreEvidence: {
      status: "succeeded",
      requiredMigration: REQUIRED_MIGRATION,
      occurredAt: "2020-01-01T00:00:00.000Z",
    },
  },
  {
    backupRestoreEvidence: {
      status: "succeeded",
      requiredMigration: "017_audit_integrity.sql",
      occurredAt: new Date().toISOString(),
    },
  },
  { auditExportEvidence: undefined },
  {
    auditExportEvidence: {
      status: "failed",
      requiredMigration: REQUIRED_MIGRATION,
      occurredAt: new Date().toISOString(),
    },
  },
  {
    auditExportEvidence: {
      status: "succeeded",
      requiredMigration: REQUIRED_MIGRATION,
      occurredAt: new Date(Date.now() - 37 * 60 * 60 * 1000).toISOString(),
    },
  },
  {
    auditExportEvidence: {
      status: "succeeded",
      requiredMigration: "017_audit_integrity.sql",
      occurredAt: new Date().toISOString(),
    },
  },
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
    auditExportEvidenceRequired: true,
  }),
);
