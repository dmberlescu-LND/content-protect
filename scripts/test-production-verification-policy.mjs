import assert from "node:assert/strict";

import {
  commercialVerificationRequired,
  monitoringBootstrapAllowed,
} from "../production-verification-policy.mjs";

const approvedReady = {
  launchGovernance: { status: "approved" },
  operationalGates: {
    scanner: true,
    videoScanning: true,
    takedownDelivery: true,
    billing: true,
    ageVerification: true,
    retentionAutomation: true,
    monitoring: false,
    backupRestore: true,
    auditExport: true,
    launchGovernance: true,
  },
};

assert.equal(commercialVerificationRequired(false, approvedReady), true);
assert.equal(
  commercialVerificationRequired(false, {
    launchGovernance: { status: "unconfigured" },
  }),
  false,
);
assert.equal(commercialVerificationRequired(true, {}), true);
assert.equal(monitoringBootstrapAllowed(true, approvedReady), true);

for (const unsafe of [
  {
    ...approvedReady,
    operationalGates: {
      ...approvedReady.operationalGates,
      billing: false,
    },
  },
  {
    ...approvedReady,
    operationalGates: {
      ...approvedReady.operationalGates,
      monitoring: true,
    },
  },
  {
    ...approvedReady,
    launchGovernance: { status: "unconfigured" },
  },
  { ...approvedReady, operationalGates: undefined },
])
  assert.equal(monitoringBootstrapAllowed(true, unsafe), false);

assert.equal(monitoringBootstrapAllowed(false, approvedReady), false);

console.log(
  JSON.stringify({
    ok: true,
    governanceAutomaticallyEnforcesCommercialChecks: true,
    monitoringOnlyBootstrapAllowed: true,
    secondFalseGateRejected: true,
  }),
);
