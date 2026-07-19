import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { COMPLIANCE_VERSIONS } from "../compliance-versions.mjs";
import { REQUIRED_MIGRATION } from "../operations-readiness.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const read = async (path) => readFile(resolve(root, path), "utf8");
const requireText = (name, text, expected) => {
  if (!text.includes(expected)) {
    failures.push(`${name}: missing ${JSON.stringify(expected)}`);
  }
};
const rejectText = (name, text, forbidden) => {
  if (text.includes(forbidden)) {
    failures.push(`${name}: must not contain ${JSON.stringify(forbidden)}`);
  }
};

const [
  privacy,
  terms,
  server,
  render,
  dockerfile,
  runbook,
  checklist,
  processors,
  ropa,
  takedowns,
  readiness,
] = await Promise.all([
  read("public/privacy.html"),
  read("public/terms.html"),
  read("server.mjs"),
  read("render.yaml"),
  read("Dockerfile"),
  read("docs/OPERATIONS-RUNBOOK.md"),
  read("docs/UK-LAUNCH-CHECKLIST.md"),
  read("docs/compliance/PROCESSOR-REGISTER.md"),
  read("docs/compliance/ROPA.md"),
  read("docs/compliance/TAKEDOWN-AND-DISPUTE-PROCEDURE.md"),
  read("operations-readiness.mjs"),
]);

for (const [name, page] of [
  ["privacy notice", privacy],
  ["service terms", terms],
]) {
  requireText(name, page, "18 July 2026");
  requireText(name, page, "Version 1.0");
  requireText(name, page, "White Eagles Digital Marketing LTD");
  requireText(name, page, "14978662");
  requireText(name, page, "E1 1AG");
  requireText(name, page, "white.eagles.dm@gmail.com");
}
requireText("service terms", terms, "cancellation-form.html");
requireText("service terms", terms, "Stripe");

requireText("server", server, 'from "./compliance-versions.mjs"');
for (const key of [
  "eligibility",
  "sensitiveMediaConsent",
  "serviceTerms",
  "takedownTemplate",
]) {
  requireText("server", server, `COMPLIANCE_VERSIONS.${key}`);
}
rejectText("server", server, 'const TAKEDOWN_TEMPLATE_VERSION = "2026-07-18"');

for (const [name, document] of [
  ["operations runbook", runbook],
  ["UK launch checklist", checklist],
]) {
  requireText(name, document, COMPLIANCE_VERSIONS.takedownTemplate);
}

for (const provider of [
  "Yoti",
  "TinEye",
  "Video matching provider",
  "Monitoring provider",
]) {
  requireText("processor register", processors, provider);
}
requireText("processor register", processors, "Production blocked");
requireText(
  "processor register",
  processors,
  "API activation and end-to-end test blocked",
);
requireText(
  "processor register",
  processors,
  "product must not claim video scanning",
);

requireText("ROPA", ropa, "age-assurance outcome");
rejectText(
  "ROPA account record",
  ropa.split("\n").find((line) => line.startsWith("| Account and security")) ||
    "",
  "; identity,",
);
requireText(
  "takedown procedure",
  takedowns,
  "do not claim full identity verification",
);

requireText("Render", render, "PAYMENTS_MODE");
rejectText("Render", render, "preDeployCommand:");
requireText("Render", render, "value: test");
requireText("Render", render, "TAKEDOWNS_MODE");
requireText("Render", render, "value: sandbox");
requireText("Render", render, "TAKEDOWN_LEGAL_APPROVED_VERSION");
const legalVersionBlock = render.match(
  /- key: TAKEDOWN_LEGAL_APPROVED_VERSION\n\s+([^\n]+)/,
)?.[1];
if (legalVersionBlock !== "sync: false") {
  failures.push(
    "Render: legal approval version must remain an operator-supplied secret",
  );
}
requireText(
  "Docker runtime",
  dockerfile,
  "COPY --from=build --chown=contentprotect:contentprotect /app/*.mjs ./",
);
requireText(
  "Docker runtime",
  dockerfile,
  'CMD ["/bin/sh", "-c", "node scripts/migrate.mjs && exec node server.mjs"]',
);

requireText("operations readiness", readiness, REQUIRED_MIGRATION);
try {
  await access(resolve(root, "db", "migrations", REQUIRED_MIGRATION));
} catch {
  failures.push(`migration: missing db/migrations/${REQUIRED_MIGRATION}`);
}

if (failures.length) {
  console.error("Compliance verification failed:\n- " + failures.join("\n- "));
  process.exitCode = 1;
} else {
  console.log(
    `Compliance verification passed (privacy ${COMPLIANCE_VERSIONS.privacyNotice}, terms ${COMPLIANCE_VERSIONS.serviceTerms}, takedown ${COMPLIANCE_VERSIONS.takedownTemplate}).`,
  );
}
