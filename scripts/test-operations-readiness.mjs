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
  videoScanner: "tineye-keyframes",
  takedownDeliveryConfigured: true,
  takedownsMode: "live",
  stripeConfigured: true,
  stripeMode: "live",
  yotiConfigured: true,
  yotiMode: "live",
  retentionEvidence: {
    status: "succeeded",
    requiredMigration: REQUIRED_MIGRATION,
    occurredAt: new Date().toISOString(),
  },
  monitoringEvidence: {
    status: "succeeded",
    release: "abcdef123456",
    occurredAt: new Date().toISOString(),
  },
  currentRelease: "abcdef123456",
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
  launchGovernance: {
    approved: true,
    status: "approved",
  },
};

assert.deepEqual(operationsReadiness(complete), {
  infrastructureReady: true,
  productionReady: true,
  operationalGates: {
    scanner: true,
    videoScanning: true,
    takedownDelivery: true,
    billing: true,
    ageVerification: true,
    retentionAutomation: true,
    monitoring: true,
    backupRestore: true,
    auditExport: true,
    launchGovernance: true,
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
  { scanner: "compliance-blocked" },
  { videoScanner: "privacy-blocked" },
  { videoScanner: "unconfigured" },
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
      requiredMigration: REQUIRED_MIGRATION,
      occurredAt: new Date().toISOString(),
    },
  },
  { monitoringEvidence: undefined },
  {
    monitoringEvidence: {
      status: "succeeded",
      release: "111111111111",
      occurredAt: new Date().toISOString(),
    },
  },
  {
    retentionEvidence: {
      status: "succeeded",
      requiredMigration: REQUIRED_MIGRATION,
      occurredAt: new Date(Date.now() - 37 * 60 * 60 * 1000).toISOString(),
    },
  },
  {
    retentionEvidence: {
      status: "succeeded",
      requiredMigration: "020_consumer_cases.sql",
      occurredAt: new Date().toISOString(),
    },
  },
  {
    monitoringEvidence: {
      status: "succeeded",
      release: "abcdef123456",
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
  { launchGovernance: undefined },
  { launchGovernance: { approved: false, status: "unconfigured" } },
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
    approvedCommercialImageAndVideoScanningRequired: true,
    retentionEvidenceSchemaBound: true,
    monitoringEvidenceReleaseBound: true,
    restoreEvidenceExpiry: true,
    auditExportEvidenceRequired: true,
    signedLaunchGovernanceRequired: true,
  }),
);
