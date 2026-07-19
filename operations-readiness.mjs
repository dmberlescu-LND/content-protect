export const REQUIRED_MIGRATION = "016_backup_restore_evidence.sql";

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
  takedownDeliveryConfigured,
  takedownsMode,
  stripeConfigured,
  stripeMode,
  yotiConfigured,
  yotiMode,
  retentionEvidence,
  monitoringEvidence,
  backupRestoreEvidence,
}) {
  const infrastructureReady = Boolean(
    database?.ok &&
    database.mode === "postgresql" &&
    database.latestMigration === REQUIRED_MIGRATION &&
    storage?.ok &&
    storage.mode === "private-object-storage" &&
    hasExternalMasterKey,
  );
  const operationalGates = {
    scanner: scanner !== "unconfigured",
    takedownDelivery: Boolean(
      takedownDeliveryConfigured && takedownsMode === "live",
    ),
    billing: Boolean(stripeConfigured && stripeMode === "live"),
    ageVerification: Boolean(yotiConfigured && yotiMode === "live"),
    retentionAutomation: freshEvidence(retentionEvidence, 36 * 60 * 60 * 1000),
    monitoring: freshEvidence(monitoringEvidence, 15 * 60 * 1000),
    backupRestore: freshEvidence(
      backupRestoreEvidence,
      100 * 24 * 60 * 60 * 1000,
    ),
  };
  return {
    infrastructureReady,
    productionReady:
      infrastructureReady && Object.values(operationalGates).every(Boolean),
    operationalGates,
  };
}
