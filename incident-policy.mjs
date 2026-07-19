import { randomUUID } from "node:crypto";

const SEVERITIES = new Set(["SEV-1", "SEV-2", "SEV-3"]);
const PERSONAL_DATA_STATES = new Set([
  "assessing",
  "not-a-breach",
  "personal-data-breach",
]);
const NOTIFICATION_DECISIONS = new Set([
  "pending",
  "required",
  "not-required",
  "completed",
]);
const EVENT_TYPES = new Set([
  "assessment",
  "containment",
  "evidence-preserved",
  "processor-contacted",
  "recovery",
  "communication",
  "corrective-action",
]);

export class IncidentPolicyError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "IncidentPolicyError";
    this.status = status;
  }
}

const clean = (value, max) =>
  String(value || "")
    .trim()
    .slice(0, max);
const requiredText = (value, name, min, max) => {
  const text = clean(value, max + 1);
  if (text.length < min || text.length > max)
    throw new IncidentPolicyError(
      `${name} must be between ${min} and ${max} characters.`,
    );
  return text;
};

export function validIncidentTimestamp(value, now = new Date()) {
  const timestamp = new Date(value);
  if (
    !value ||
    !Number.isFinite(timestamp.getTime()) ||
    timestamp > new Date(now.getTime() + 5 * 60_000)
  )
    throw new IncidentPolicyError("The incident timestamp is invalid.");
  return timestamp.toISOString();
}

export function icoDeadline(awareAt) {
  return new Date(new Date(awareAt).getTime() + 72 * 60 * 60_000).toISOString();
}

export function incidentUrgency(incident, now = new Date()) {
  if (
    incident.status === "closed" ||
    incident.personalDataStatus !== "personal-data-breach" ||
    ["completed", "not-required"].includes(incident.icoDecision)
  )
    return { state: "not-running", hoursRemaining: null };
  const due = Date.parse(incident.icoDeadlineAt || "");
  if (!Number.isFinite(due)) return { state: "invalid", hoursRemaining: null };
  const hoursRemaining =
    Math.round(((due - now.getTime()) / 3_600_000) * 10) / 10;
  return {
    state:
      hoursRemaining < 0
        ? "overdue"
        : hoursRemaining <= 12
          ? "critical"
          : hoursRemaining <= 36
            ? "urgent"
            : "running",
    hoursRemaining,
  };
}

export function createIncident(
  input,
  { id, operatorReference, now = new Date() },
) {
  if (!SEVERITIES.has(input.severity))
    throw new IncidentPolicyError("Choose a valid incident severity.");
  const roles = {
    incidentCommander: requiredText(
      input.roles?.incidentCommander,
      "Incident Commander",
      3,
      80,
    ),
    securityLead: requiredText(
      input.roles?.securityLead,
      "Security Lead",
      3,
      80,
    ),
    privacyLead: requiredText(input.roles?.privacyLead, "Privacy Lead", 3, 80),
    communicationsLead: requiredText(
      input.roles?.communicationsLead,
      "Communications Lead",
      3,
      80,
    ),
  };
  const createdAt = now.toISOString(),
    occurredAt = validIncidentTimestamp(input.occurredAt, now),
    personalDataStatus = PERSONAL_DATA_STATES.has(input.personalDataStatus)
      ? input.personalDataStatus
      : "assessing",
    awareAt =
      personalDataStatus === "personal-data-breach"
        ? validIncidentTimestamp(input.awareAt, now)
        : null;
  return {
    id,
    title: requiredText(input.title, "Title", 8, 120),
    severity: input.severity,
    status: "declared",
    summary: requiredText(input.summary, "Summary", 20, 2000),
    systems: requiredText(input.systems, "Affected systems", 3, 500),
    dataCategories: clean(input.dataCategories, 500) || null,
    approximateSubjects:
      String(input.approximateSubjects ?? "").trim() &&
      Number.isInteger(Number(input.approximateSubjects))
        ? Math.max(0, Math.min(10_000_000, Number(input.approximateSubjects)))
        : null,
    roles,
    personalDataStatus,
    awareAt,
    icoDeadlineAt: awareAt ? icoDeadline(awareAt) : null,
    icoDecision: "pending",
    icoDecisionRationale: null,
    icoNotifiedAt: null,
    icoReference: null,
    subjectsDecision: "pending",
    subjectsDecisionRationale: null,
    subjectsNotifiedAt: null,
    rootCause: null,
    correctiveActions: null,
    closureReviewReference: null,
    occurredAt,
    createdAt,
    updatedAt: createdAt,
    closedAt: null,
    events: [
      {
        id: randomUUID(),
        type: "assessment",
        note: "Incident declared and response roles assigned.",
        actorReference: operatorReference,
        at: createdAt,
      },
    ],
  };
}

export function addIncidentEvent(
  incident,
  input,
  { operatorReference, now = new Date() },
) {
  if (incident.status === "closed")
    throw new IncidentPolicyError(
      "A closed incident cannot receive new events.",
      409,
    );
  if (!EVENT_TYPES.has(input.type))
    throw new IncidentPolicyError("Choose a valid incident event type.");
  const event = {
    id: randomUUID(),
    type: input.type,
    note: requiredText(input.note, "Event note", 10, 2000),
    actorReference: operatorReference,
    at: validIncidentTimestamp(input.at || now.toISOString(), now),
  };
  incident.events ||= [];
  incident.events.push(event);
  if (input.type === "containment" && incident.status === "declared")
    incident.status = "contained";
  if (input.type === "recovery") incident.status = "recovered";
  incident.updatedAt = now.toISOString();
  return event;
}

export function recordBreachAssessment(
  incident,
  input,
  { now = new Date() } = {},
) {
  if (incident.status === "closed")
    throw new IncidentPolicyError(
      "A closed incident cannot be reassessed.",
      409,
    );
  if (!PERSONAL_DATA_STATES.has(input.personalDataStatus))
    throw new IncidentPolicyError("Choose a valid personal-data assessment.");
  incident.personalDataStatus = input.personalDataStatus;
  if (input.personalDataStatus === "personal-data-breach") {
    const awareAt =
      incident.awareAt || validIncidentTimestamp(input.awareAt, now);
    incident.awareAt = awareAt;
    incident.icoDeadlineAt = icoDeadline(awareAt);
  } else if (!incident.awareAt) {
    incident.awareAt = null;
    incident.icoDeadlineAt = null;
  }
  incident.updatedAt = now.toISOString();
  return incident;
}

function notificationDecision(input, prefix, now) {
  const decision = input[`${prefix}Decision`];
  if (!NOTIFICATION_DECISIONS.has(decision))
    throw new IncidentPolicyError("Choose a valid notification decision.");
  const rationale =
    decision === "pending"
      ? null
      : requiredText(
          input[`${prefix}DecisionRationale`],
          "Decision rationale",
          20,
          2000,
        );
  const notifiedAt =
    decision === "completed"
      ? validIncidentTimestamp(input[`${prefix}NotifiedAt`], now)
      : null;
  return { decision, rationale, notifiedAt };
}

export function recordNotificationDecision(
  incident,
  input,
  { now = new Date() } = {},
) {
  if (incident.status === "closed")
    throw new IncidentPolicyError("A closed incident cannot be changed.", 409);
  if (incident.personalDataStatus === "assessing")
    throw new IncidentPolicyError(
      "Complete the personal-data assessment before notification decisions.",
      409,
    );
  const ico = notificationDecision(input, "ico", now),
    subjects = notificationDecision(input, "subjects", now);
  incident.icoDecision = ico.decision;
  incident.icoDecisionRationale = ico.rationale;
  incident.icoNotifiedAt = ico.notifiedAt;
  incident.icoReference =
    ico.decision === "completed"
      ? requiredText(input.icoReference, "ICO reference", 3, 120)
      : null;
  incident.subjectsDecision = subjects.decision;
  incident.subjectsDecisionRationale = subjects.rationale;
  incident.subjectsNotifiedAt = subjects.notifiedAt;
  incident.updatedAt = now.toISOString();
  return incident;
}

export function closeIncident(incident, input, { now = new Date() } = {}) {
  if (incident.status === "closed")
    throw new IncidentPolicyError("The incident is already closed.", 409);
  if (incident.personalDataStatus === "assessing")
    throw new IncidentPolicyError(
      "The personal-data assessment is incomplete.",
      409,
    );
  if ([incident.icoDecision, incident.subjectsDecision].includes("pending"))
    throw new IncidentPolicyError(
      "Notification decisions are incomplete.",
      409,
    );
  if ([incident.icoDecision, incident.subjectsDecision].includes("required"))
    throw new IncidentPolicyError(
      "A required notification must be recorded as completed before closure.",
      409,
    );
  if (incident.status !== "recovered")
    throw new IncidentPolicyError(
      "Record containment and recovery evidence before closure.",
      409,
    );
  incident.rootCause = requiredText(input.rootCause, "Root cause", 20, 3000);
  incident.correctiveActions = requiredText(
    input.correctiveActions,
    "Corrective actions",
    20,
    3000,
  );
  incident.closureReviewReference = requiredText(
    input.closureReviewReference,
    "Closure review reference",
    3,
    120,
  );
  incident.status = "closed";
  incident.closedAt = now.toISOString();
  incident.updatedAt = incident.closedAt;
  return incident;
}

export const INCIDENT_EVENT_TYPES = Object.freeze([...EVENT_TYPES]);
