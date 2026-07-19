export const REQUIRED_MIGRATION = "015_operational_evidence.sql";

const verifiedRestore = (value) => {
  if (!value) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > Date.now()) return false;
  return Date.now() - timestamp <= 100 * 24 * 60 * 60 * 1000;
};

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
  stripeConfigured,
  yotiConfigured,
  retentionEvidence,
  monitoringEvidence,
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
    retentionAutomation: freshEvidence(retentionEvidence, 36 * 60 * 60 * 1000),
    monitoring: freshEvidence(monitoringEvidence, 15 * 60 * 1000),
    backupRestore: verifiedRestore(backupRestoreVerifiedAt),
  };
  return {
    infrastructureReady,
    productionReady:
      infrastructureReady && Object.values(operationalGates).every(Boolean),
    operationalGates,
  };
}
