export const REQUIRED_MIGRATION = "012_retention_legal_holds.sql";

const verifiedRestore = (value) => {
  if (!value) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > Date.now()) return false;
  return Date.now() - timestamp <= 100 * 24 * 60 * 60 * 1000;
};

export function operationsReadiness({
  database,
  storage,
  hasExternalMasterKey,
  scanner,
  takedownDeliveryConfigured,
  stripeConfigured,
  yotiConfigured,
  retentionAutomationConfigured,
  monitoringConfigured,
  backupRestoreVerifiedAt,
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
    takedownDelivery: Boolean(takedownDeliveryConfigured),
    billing: Boolean(stripeConfigured),
    ageVerification: Boolean(yotiConfigured),
    retentionAutomation: Boolean(retentionAutomationConfigured),
    monitoring: Boolean(monitoringConfigured),
    backupRestore: verifiedRestore(backupRestoreVerifiedAt),
  };
  return {
    infrastructureReady,
    productionReady:
      infrastructureReady && Object.values(operationalGates).every(Boolean),
    operationalGates,
  };
}
