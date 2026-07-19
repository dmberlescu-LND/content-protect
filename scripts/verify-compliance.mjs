import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { COMPLIANCE_VERSIONS } from "../compliance-versions.mjs";
import { PLAN_ENTITLEMENTS } from "../billing-policy.mjs";
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
  scanner,
  render,
  dockerfile,
  runbook,
  checklist,
  processors,
  ropa,
  takedowns,
  readiness,
  mediaBackup,
  seoRunbook,
  backupRunner,
  isolatedRestoreRunner,
  tineyeActivation,
  videoFrames,
  dpia,
  videoRuntimeTest,
  contentRightsPolicy,
  pageCapturePolicy,
  takedownPolicy,
  retentionPolicy,
  database,
  auditExportPolicy,
  auditExportJob,
] = await Promise.all([
  read("public/privacy.html"),
  read("public/terms.html"),
  read("server.mjs"),
  read("scanner.mjs"),
  read("render.yaml"),
  read("Dockerfile"),
  read("docs/OPERATIONS-RUNBOOK.md"),
  read("docs/UK-LAUNCH-CHECKLIST.md"),
  read("docs/compliance/PROCESSOR-REGISTER.md"),
  read("docs/compliance/ROPA.md"),
  read("docs/compliance/TAKEDOWN-AND-DISPUTE-PROCEDURE.md"),
  read("operations-readiness.mjs"),
  read("media-backup-policy.mjs"),
  read("docs/SEO-LAUNCH-RUNBOOK.md"),
  read("scripts/run-backups.mjs"),
  read("scripts/run-isolated-restore-drill.mjs"),
  read("docs/vendor-due-diligence/TINEYE-ACTIVATION.md"),
  read("video-frames.mjs"),
  read("docs/compliance/DPIA-DRAFT.md"),
  read("scripts/test-video-frames-runtime.mjs"),
  read("content-rights-policy.mjs"),
  read("page-capture-policy.mjs"),
  read("takedown-policy.mjs"),
  read("retention-policy.mjs"),
  read("database.mjs"),
  read("audit-export-policy.mjs"),
  read("scripts/export-audit-log.mjs"),
]);

for (const [name, page] of [
  ["privacy notice", privacy],
  ["service terms", terms],
]) {
  requireText(name, page, "White Eagles Digital Marketing LTD");
  requireText(name, page, "14978662");
  requireText(name, page, "E1 1AG");
  requireText(name, page, "white.eagles.dm@gmail.com");
}
requireText("privacy notice", privacy, "19 July 2026");
requireText("privacy notice", privacy, "Version 1.1");
requireText("privacy notice", privacy, "creator-supplied page captures");
requireText("privacy notice", privacy, "not independent notarisation");
requireText("service terms", terms, "19 July 2026");
requireText("service terms", terms, "Version 1.1");
for (const [plan, entitlement] of Object.entries(PLAN_ENTITLEMENTS))
  requireText(
    "service terms",
    terms,
    `${plan} includes up to ${entitlement.assetLimit}`,
  );
requireText("service terms", terms, "cancellation-form.html");
requireText("service terms", terms, "Stripe");

requireText("server", server, 'from "./compliance-versions.mjs"');
for (const key of [
  "eligibility",
  "sensitiveMediaConsent",
  "contentRightsDeclaration",
  "pageCaptureConsent",
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
  "Video frame processing",
  "Monitoring/audit provider",
]) {
  requireText("processor register", processors, provider);
}
requireText("processor register", processors, "Production blocked");
requireText(
  "processor register",
  processors,
  "Still images fail closed until the API key",
);
requireText(
  "processor register",
  processors,
  "TINEYE_VIDEO_FRAME_APPROVAL_REFERENCE",
);
requireText("processor register", processors, "no audio or full video");

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
requireText(
  "takedown procedure",
  takedowns,
  "A general registration checkbox is not sufficient",
);
requireText("takedown procedure", takedowns, "legal claimant name");
requireText("content rights policy", contentRightsPolicy, "copyright-owner");
requireText("content rights policy", contentRightsPolicy, "authorised-agent");
requireText("content rights policy", contentRightsPolicy, "exclusive-licensee");
requireText(
  "content rights policy",
  contentRightsPolicy,
  "confirmRightsAuthority",
);
requireText("server", server, "contentRightsDeclaration");
requireText("server", server, "contentRightsRecordForAsset");
requireText("server", server, "contentRightsReview");
requireText("server", server, 'req.method === "PUT"');
requireText("server", server, "rightsDeclarationRecordId");
requireText("page capture policy", pageCapturePolicy, "Evidence capture");
requireText("page capture policy", pageCapturePolicy, "checksumSha256");
requireText("page capture policy", pageCapturePolicy, "attestedTargetPage");
requireText("page capture policy", pageCapturePolicy, "attestedUnaltered");
requireText("server", server, "/page-capture");
requireText("server", server, "confirmPageCaptureReviewed");
requireText("server", server, "case.page_capture_accessed");
requireText("server", server, "pageCaptureChecksum");
requireText("retention policy", retentionPolicy, "pageCapture?.assetId");
requireText("retention database", database, "orphanEvidenceCaptures");
requireText("audit export policy", auditExportPolicy, "CPAEX001");
requireText("audit export policy", auditExportPolicy, "AUDIT_EXPORT_PREFIX");
requireText("audit export policy", auditExportPolicy, "400");
requireText("audit export job", auditExportJob, 'IfNoneMatch: "*"');
requireText("audit export job", auditExportJob, "serializeAuditRecords");
requireText("audit export job", auditExportJob, "verifyAuditExportManifest");
requireText(
  "audit export job",
  auditExportJob,
  "GetBucketLifecycleConfigurationCommand",
);
requireText("audit export job", auditExportJob, 'type: "audit_export"');
requireText("operations readiness", readiness, "auditExportEvidence");
requireText("operations runbook", runbook, "pnpm audit:export");
requireText("operations runbook", runbook, "no delete permission");
requireText("UK launch checklist", checklist, "auditExport");
requireText("DPIA", dpia, "Independently retained audit exports");
requireText("operations runbook", runbook, "creator-supplied JPEG");
requireText("takedown procedure", takedowns, "evidence snapshot version 3");
requireText("DPIA", dpia, "current page capture");
requireText("takedown notice", takedownPolicy, "Claimant: ${creator.name}");
requireText("takedown notice", takedownPolicy, "Rights holder:");
requireText("takedown notice", takedownPolicy, "Claimant capacity:");

requireText("Render", render, "PAYMENTS_MODE");
requireText("Render", render, "YOTI_SDK_ID");
requireText("Render", render, "YOTI_PRIVATE_KEY");
rejectText("Render", render, "YOTI_API_KEY");
for (const key of [
  "TINEYE_DATA_PROTECTION_APPROVAL_REFERENCE",
  "TINEYE_ADULT_CONTENT_APPROVAL_REFERENCE",
]) {
  requireText("Render", render, key);
  requireText("scanner", scanner, key);
}
requireText("Render", render, "TINEYE_VIDEO_FRAME_APPROVAL_REFERENCE");
requireText("scanner", scanner, "TINEYE_VIDEO_FRAME_APPROVAL_REFERENCE");
requireText("scanner", scanner, "videoScannerReadiness");
requireText("server", server, "videoScannerMode");
requireText("server", server, "videoScannerActivation.ready");
requireText(
  "video frame processor",
  videoFrames,
  "MAX_VIDEO_SECONDS = 10 * 60",
);
requireText("video frame processor", videoFrames, "MAX_FRAMES = 3");
requireText("video frame processor", videoFrames, '"-protocol_whitelist"');
requireText("video frame processor", videoFrames, '"-map_metadata"');
requireText("video frame processor", videoFrames, '"-an"');
requireText("video frame processor", videoFrames, '"-sn"');
requireText("video frame processor", videoFrames, '"-dn"');
requireText("video runtime test", videoRuntimeTest, "testsrc2");
requireText("Docker runtime", dockerfile, "test-video-frames-runtime.mjs");
requireText("DPIA", dpia, "TINEYE_VIDEO_FRAME_APPROVAL_REFERENCE");
requireText("TinEye activation", tineyeActivation, "up to three paid searches");
requireText("TinEye activation", tineyeActivation, "full video or audio");
requireText("TinEye activation", tineyeActivation, "PIPEDA");
requireText("TinEye activation", tineyeActivation, "compliance-blocked");
requireText("TinEye activation", tineyeActivation, "automatic top-up disabled");
requireText("Render", render, "content-protect-retention");
requireText("Render", render, "dockerCommand: node scripts/retention.mjs");
for (const key of [
  "OBJECT_STORAGE_ENDPOINT",
  "OBJECT_STORAGE_BUCKET",
  "OBJECT_STORAGE_ACCESS_KEY_ID",
  "OBJECT_STORAGE_SECRET_ACCESS_KEY",
])
  requireText("Render retention storage", render, `envVarKey: ${key}`);
rejectText(
  "Render retention preview",
  render,
  "dockerCommand: node scripts/retention.mjs --execute",
);
requireText("Render", render, "MONITORING_HEARTBEAT_TOKEN");
rejectText("Render", render, "MONITORING_CONFIGURED");
requireText("Render", render, "BACKUP_RESTORE_EVIDENCE_TOKEN");
requireText("Render", render, "BACKUP_RESTORE_EVIDENCE_URL");
rejectText("Render", render, "BACKUP_RESTORE_VERIFIED_AT");
requireText("server", server, 'from "./yoti-digital-identity.mjs"');
requireText("server", server, "/api/operations/backup-restore-evidence");
rejectText("server", server, "https://age.yoti.com/api/v1/sessions");
rejectText("Render", render, "preDeployCommand:");
requireText("Render", render, "value: test");
requireText("Render", render, "TAKEDOWNS_MODE");
requireText("Render", render, "value: sandbox");
requireText("Render", render, "YOTI_MODE");
requireText("server", server, "TAKEDOWN_DELIVERY_LIVE");
requireText("server", server, 'TAKEDOWNS_MODE === "live"');
requireText("Render", render, "TAKEDOWN_LEGAL_APPROVED_VERSION");
for (const key of [
  "TAKEDOWN_OPERATOR_TOKEN",
  "TAKEDOWN_OPERATOR_ID",
  "TAKEDOWN_OPERATOR_TOTP_SECRET",
]) {
  requireText("Render", render, key);
  const operatorSecretBlock = render.match(
    new RegExp(`- key: ${key}\\n\\s+([^\\n]+)`),
  )?.[1];
  if (operatorSecretBlock !== "sync: false")
    failures.push(`Render: ${key} must remain operator-supplied`);
}
requireText("server", server, "operatorTotpValid");
requireText("server", server, '"operator.login"');
requireText(
  "server",
  server,
  "OPERATOR_CONFIGURATION.configured && operatorSession(req, d)",
);
rejectText("server", server, "if (operatorTokenValid(supplied)) return true");
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
requireText("Docker runtime", dockerfile, "postgresql-contrib");
requireText("Docker runtime", dockerfile, "ffmpeg");
requireText("Docker runtime", dockerfile, "ffprobe");
requireText("backup runner", backupRunner, "backupRestoreDrillDue");
requireText("backup runner", backupRunner, "run-isolated-restore-drill.mjs");
requireText(
  "isolated restore runner",
  isolatedRestoreRunner,
  "delete restoreEnvironment.DATABASE_URL",
);
requireText("isolated restore runner", isolatedRestoreRunner, "pg_ctl");

requireText("operations readiness", readiness, REQUIRED_MIGRATION);
requireText("operations runbook", runbook, "storage-deletion queue");
requireText("operations runbook", runbook, "latest result");
requireText(
  "operations runbook",
  runbook,
  "schema change requires a new backup",
);
requireText("operations runbook", runbook, "R2 does not currently implement");
requireText("operations runbook", runbook, "second private backup bucket");
rejectText("operations runbook", runbook, "Enable private bucket versioning");
requireText("media backup policy", mediaBackup, "must differ from the primary");
requireText("SEO runbook", seoRunbook, "Google Search Console");
requireText("SEO runbook", seoRunbook, "six discovered pages");
requireText("SEO runbook", seoRunbook, "must remain in Porkbun");
requireText("UK launch checklist", checklist, "SEO-LAUNCH-RUNBOOK.md");
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
