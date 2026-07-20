export function commercialVerificationRequired(requireProductionReady, ready) {
  return Boolean(
    requireProductionReady || ready?.launchGovernance?.status === "approved",
  );
}

export function monitoringBootstrapAllowed(enforceProductionReady, ready) {
  return Boolean(
    enforceProductionReady &&
    ready?.launchGovernance?.status === "approved" &&
    ready?.operationalGates?.monitoring === false &&
    Object.entries(ready.operationalGates || {}).every(
      ([gate, value]) => gate === "monitoring" || value === true,
    ),
  );
}
