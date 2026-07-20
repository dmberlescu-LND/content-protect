export const REQUIRED_MIGRATION = "022_subscription_consent_binding.sql";

const freshEvidence = (value, maxAgeMs) => {
  const timestamp = Date.parse(value?.occurredAt || "");
  return Boolean(
    value?.status === "succeeded" &&
    Number.isFinite(timestamp) &&
    timestamp <= Date.now() + 5 * 60 * 1000 &&
    Date.now() - timestamp <= maxAgeMs,
  );
};

export function operationsReadiness({
  database,
  storage,
  hasExternalMasterKey,
  scanner,
  videoScanner,
  takedownDeliveryConfigured,
  takedownsMode,
  stripeConfigured,
  stripeMode,
  yotiConfigured,
  yotiMode,
  retentionEvidence,
  monitoringEvidence,
  currentRelease,
  backupRestoreEvidence,
  auditExportEvidence,
  launchGovernance,
}) {
  const infrastructureReady = Boolean(
    database?.ok &&
    database.mode === "postgresql" &&
    database.latestMigration === REQUIRED_MIGRATION &&
    database.auditIntegrity?.ok === true &&
    database.auditIntegrity.mode === "hmac-sha256-chain-v1" &&
    storage?.ok &&
    storage.mode === "private-object-storage" &&
    hasExternalMasterKey,
  );
  const operationalGates = {
    scanner: scanner === "tineye-commercial",
    videoScanning: videoScanner === "tineye-keyframes",
    takedownDelivery: Boolean(
      takedownDeliveryConfigured && takedownsMode === "live",
    ),
    billing: Boolean(stripeConfigured && stripeMode === "live"),
    ageVerification: Boolean(yotiConfigured && yotiMode === "live"),
    retentionAutomation:
      freshEvidence(retentionEvidence, 36 * 60 * 60 * 1000) &&
      retentionEvidence?.requiredMigration === REQUIRED_MIGRATION,
    monitoring:
      freshEvidence(monitoringEvidence, 15 * 60 * 1000) &&
      /^[a-f0-9]{12}$/i.test(String(currentRelease || "")) &&
      monitoringEvidence?.release === currentRelease,
    backupRestore:
      freshEvidence(backupRestoreEvidence, 100 * 24 * 60 * 60 * 1000) &&
      backupRestoreEvidence?.requiredMigration === REQUIRED_MIGRATION,
    auditExport:
      freshEvidence(auditExportEvidence, 36 * 60 * 60 * 1000) &&
      auditExportEvidence?.requiredMigration === REQUIRED_MIGRATION,
    launchGovernance: launchGovernance?.approved === true,
  };
  return {
    infrastructureReady,
    productionReady:
      infrastructureReady && Object.values(operationalGates).every(Boolean),
    operationalGates,
  };
}
