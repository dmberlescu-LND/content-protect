import assert from "node:assert/strict";

import {
  addIncidentEvent,
  closeIncident,
  createIncident,
  icoDeadline,
  incidentUrgency,
  IncidentPolicyError,
  recordBreachAssessment,
  recordNotificationDecision,
} from "../incident-policy.mjs";

const now = new Date("2026-07-19T12:00:00.000Z"),
  awareAt = "2026-07-19T10:30:00.000Z",
  base = {
    title: "Possible unauthorised database access",
    severity: "SEV-1",
    summary:
      "An unusual authenticated query pattern was detected and requires immediate investigation.",
    systems: "Production API and PostgreSQL",
    dataCategories: "Account and encrypted-reference metadata",
    approximateSubjects: 12,
    personalDataStatus: "personal-data-breach",
    awareAt,
    occurredAt: "2026-07-19T10:00:00.000Z",
    roles: {
      incidentCommander: "director-on-call",
      securityLead: "security-lead",
      privacyLead: "privacy-lead",
      communicationsLead: "communications-lead",
    },
  },
  incident = createIncident(base, {
    id: "11111111-1111-4111-8111-111111111111",
    operatorReference: "director-on-call",
    now,
  });

assert.equal(incident.icoDeadlineAt, "2026-07-22T10:30:00.000Z");
assert.equal(icoDeadline(awareAt), incident.icoDeadlineAt);
assert.deepEqual(incidentUrgency(incident, now), {
  state: "running",
  hoursRemaining: 70.5,
});
assert.equal(
  incidentUrgency(incident, new Date("2026-07-22T11:00:00.000Z")).state,
  "overdue",
);
assert.throws(
  () =>
    recordNotificationDecision(
      { ...incident, personalDataStatus: "assessing" },
      {},
      { now },
    ),
  IncidentPolicyError,
);

addIncidentEvent(
  incident,
  {
    type: "containment",
    note: "Affected application credentials were revoked and the workload was isolated.",
  },
  { operatorReference: "security-lead", now },
);
assert.equal(incident.status, "contained");
assert.throws(
  () =>
    closeIncident(
      incident,
      {
        rootCause:
          "Compromised external service credential was accepted by the API.",
        correctiveActions:
          "Rotate every credential, restrict scope and assign validation to the security owner.",
        closureReviewReference: "review-001",
      },
      { now },
    ),
  /Notification decisions are incomplete/,
);

recordNotificationDecision(
  incident,
  {
    icoDecision: "not-required",
    icoDecisionRationale:
      "Risk assessment found no likely risk to the rights and freedoms of affected people.",
    subjectsDecision: "not-required",
    subjectsDecisionRationale:
      "The contained metadata exposure does not create a high risk requiring direct notification.",
  },
  { now },
);
assert.equal(incidentUrgency(incident, now).state, "not-running");
assert.throws(
  () =>
    closeIncident(
      incident,
      {
        rootCause:
          "Compromised external service credential was accepted by the API.",
        correctiveActions:
          "Rotate every credential, restrict scope and assign validation to the security owner.",
        closureReviewReference: "review-001",
      },
      { now },
    ),
  /recovery evidence/,
);

addIncidentEvent(
  incident,
  {
    type: "recovery",
    note: "A known-good deployment passed access-control and audit-integrity validation.",
  },
  { operatorReference: "security-lead", now },
);
closeIncident(
  incident,
  {
    rootCause:
      "Compromised external service credential was accepted by the API.",
    correctiveActions:
      "Rotate every credential, restrict scope and assign validation to the security owner.",
    closureReviewReference: "independent-review-001",
  },
  { now },
);
assert.equal(incident.status, "closed");
assert.throws(
  () =>
    addIncidentEvent(
      incident,
      { type: "assessment", note: "This should be rejected after closure." },
      { operatorReference: "director-on-call", now },
    ),
  /closed incident/,
);

const revised = createIncident(
  { ...base, personalDataStatus: "assessing", awareAt: null },
  {
    id: "22222222-2222-4222-8222-222222222222",
    operatorReference: "director-on-call",
    now,
  },
);
recordBreachAssessment(
  revised,
  { personalDataStatus: "personal-data-breach", awareAt },
  { now },
);
recordBreachAssessment(
  revised,
  { personalDataStatus: "not-a-breach" },
  { now },
);
assert.equal(revised.awareAt, awareAt, "awareness history must be preserved");
assert.equal(revised.icoDeadlineAt, icoDeadline(awareAt));

console.log(
  JSON.stringify({
    ok: true,
    automatic72HourClock: true,
    immutableAwarenessHistory: true,
    notificationDecisionRequired: true,
    recoveryRequiredBeforeClosure: true,
  }),
);
