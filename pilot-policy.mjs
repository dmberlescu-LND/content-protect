const FREE_PILOT = "free";

// Pilot mode is deliberately a runtime boundary, not a pricing-plan label.
// It prevents a temporary free cohort from inheriting commercial behaviour if
// another provider configuration changes later.
export function pilotConfiguration(environment = process.env) {
  const configured = String(environment.CONTENT_PROTECT_PILOT_MODE || "")
    .trim()
    .toLowerCase();
  if (!configured || configured === "standard")
    return { mode: "standard", valid: true, externalActionsAllowed: true };
  if (configured === FREE_PILOT)
    return { mode: FREE_PILOT, valid: true, externalActionsAllowed: false };
  return { mode: "invalid", valid: false, externalActionsAllowed: false };
}

export function pilotAllowsExternalAction(environment, action) {
  const pilot = pilotConfiguration(environment);
  if (!pilot.valid) return false;
  if (pilot.mode === FREE_PILOT)
    return !["scan", "billing", "notice-delivery"].includes(action);
  return true;
}

export function pilotActionError(environment, action) {
  const pilot = pilotConfiguration(environment);
  if (!pilot.valid)
    return "Pilot configuration is invalid. External actions are locked until it is corrected.";
  if (pilot.mode === FREE_PILOT && !pilotAllowsExternalAction(environment, action))
    return "This is a free controlled pilot. Billing, external scanning and live notice delivery are locked.";
  return null;
}
