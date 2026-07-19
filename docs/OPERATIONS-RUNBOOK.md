# Content Protect production operations runbook

Status: operational baseline. The first encrypted database backup and isolated restore have been verified; external provider approvals, live-mode tests, retention approval and the alert destination test remain release gates.

## Service-level targets

- Public application availability target: 99.9% monthly after commercial launch.
- Liveness check: `GET /api/health/live` every minute.
- Readiness check: `GET /api/health/ready` every minute.
- Alert when readiness fails twice consecutively, the 5xx rate exceeds 2% for five minutes, or p95 response time exceeds two seconds for ten minutes.
- SEV-1 acknowledgement target: 15 minutes. SEV-2: 60 minutes. SEV-3: next business day.

The readiness endpoint checks PostgreSQL, the latest required migration, the complete audit-integrity chain, private storage and external key configuration without writing customer data. It returns HTTP 503 and `status: degraded` when any of those infrastructure checks fails; local JSON or local disk can never pass the production readiness probe. `productionReady` is deliberately false until scanning, live Yoti age verification, live operator-reviewed delivery, live Stripe billing, successful recent retention evidence, successful recent external-monitor evidence and recent restore evidence are present. Test or sandbox credentials do not satisfy a live operational gate, and manual boolean switches do not satisfy evidence-based gates.

Yoti age assurance uses the official signed Digital Identity SDK. Configure both `YOTI_SDK_ID` and the PEM private key in `YOTI_PRIVATE_KEY`; an API key is not a substitute. The policy requests only the derived `age_over:18` attribute and rejects self-asserted evidence. Missing or invalid credentials disable the age-check flow without making the application unavailable. Keep `YOTI_MODE=sandbox` until Yoti approves the organisation/application and a real end-to-end receipt test passes; only the separately approved `YOTI_MODE=live` can satisfy the production gate.

Authentication, password reset, verification, MFA, sensitive downloads, exports and operator actions use database-backed rate limits in production. Limit keys are HMAC-SHA-256 pseudonyms derived with the external master key, shared by every application instance and expired by the retention job. Login protection applies both an account limit and a broader IP limit, so distributed password attacks and shared networks are handled independently. An application restart must never clear an attacker's accumulated attempts.

Monitoring, retention and backup-restore readiness are derived from fresh PostgreSQL evidence and have no manual override. A successful isolated restore reports through `/api/operations/backup-restore-evidence` using a dedicated `BACKUP_RESTORE_EVIDENCE_TOKEN`; readiness expires that evidence after 100 days and invalidates it immediately when the required schema migration changes. Restore comparison covers every durable customer, case, consent, accounting, audit, operational-evidence and deletion-tombstone table. Set `RETENTION_EXECUTION_ENABLED=true` only inside the approved executing cron job after its production preview and policy are approved. Configuration values are never substitutes for completing the underlying control.

### External production monitor

The repository workflow `.github/workflows/production-monitor.yml` checks the public domain from infrastructure independent of Render every five minutes and after every push to `main`. Push-triggered runs first wait up to six minutes for the matching 12-character release identifier to become live, preventing a successful check of the previous deployment from being recorded for a new revision. It validates liveness, PostgreSQL readiness, private object storage, the required migration, TLS-facing security headers, legal pages and SEO. A single failed run is retried after 60 seconds so an alert represents two consecutive failures.

To commission the alert route, store the same random `MONITORING_HEARTBEAT_TOKEN` as a Render secret and a GitHub Actions repository secret. Open **GitHub → Actions → Production monitor → Run workflow**, enable **Fail after the checks to test alert delivery**, and run it. Confirm that the named on-call recipient receives the failed-workflow notification, then run it again without the failure option and confirm a green result. Only the successful run writes fresh monitoring evidence; GitHub notification settings must keep Actions failure notifications enabled for the on-call account.

Real takedown delivery also remains disabled until specialist counsel approves the exact notice template. After approval, record the approved version in Render as `TAKEDOWN_LEGAL_APPROVED_VERSION=2026-07-19-v2`. Keep `TAKEDOWNS_MODE=sandbox` during preparation and testing; the dispatch endpoint refuses all external delivery until a separately approved change sets `TAKEDOWNS_MODE=live`. Never advance either value merely to make the readiness check green; a template change requires a new review and version.

## Logs and correlation

The service emits one JSON event per request with UTC platform timestamp, request ID, method, path, status and duration. Error events contain the same request ID. Query Render logs using `requestId`; do not log request bodies, cookies, tokens, email addresses or private media.

Keep application/security logs for 12 months, with access restricted to authorised operators. Export logs to a separate retained destination before relying on them for incident evidence.

PostgreSQL audit events are append-only at the database layer and form a versioned HMAC-SHA-256 chain derived from `CONTENT_PROTECT_MASTER_KEY`. Startup migrates all legacy events atomically under an advisory lock; readiness independently verifies every retained event and the continuity between consecutive sequence numbers. A changed action, timestamp, detail object, actor pseudonym, sequence or link fails readiness. Account deletion can null the relational `user_id` without changing the immutable pseudonymous actor hash. Only the retention transaction may delete expired audit rows; a retained suffix remains individually verifiable and chain-contiguous. Never rotate the master key without a reviewed audit-chain re-signing migration and retained evidence of the former chain head.

The database chain provides tamper evidence, not an independent custody boundary. Before commercial launch, export audit and application logs to a separately administered retained destination with restricted write/delete rights and alert on any readiness integrity failure.

## Daily checks

1. Run `pnpm run verify:production` against the primary domain.
2. Review readiness, 5xx count, latency and restart events.
3. Review failed Stripe, Resend, scanner and age-provider webhooks.
4. Review the operator case queue and overdue actions without opening private media unnecessarily.
5. Run `pnpm retention:preview` and investigate unexpected volumes. The destructive command remains disabled unless the approved scheduler supplies `RETENTION_EXECUTION_ENABLED=true`; never enable it before migrations and a reviewed preview.
6. The Blueprint initially defines `content-protect-retention` at 03:17 UTC daily in preview-only mode. It receives `DATABASE_URL` from the web service through Render's service reference. Review a real production preview before changing its command to `node scripts/retention.mjs --execute`, supplying the same private-object-storage settings as the web service and setting `RETENTION_EXECUTION_ENABLED=true` in a separately approved release. Execution first persists every eligible object key in PostgreSQL, commits the related lifecycle deletion, and then drains the idempotent storage-deletion queue in bounded batches. Failed objects remain queued for retry and the job records failed evidence. A successful job records evidence only after the queue is empty. Readiness uses the latest result, accepts success for less than 36 hours, and therefore closes immediately after a failed run; previews never open the gate.

## External monitoring evidence

The GitHub production monitor runs public production and SEO checks every five minutes. After both checks succeed, it calls the machine-only heartbeat endpoint with `MONITORING_HEARTBEAT_TOKEN`; the same random value must be stored as a Render environment secret and a GitHub Actions repository secret. The endpoint applies constant-time credential comparison, rate limiting and server-side timestamps. Readiness accepts only successful evidence less than 15 minutes old. Never place the token in source code or workflow logs. 6. Confirm no provider credentials or customer data appeared in logs.

Stripe access is reconciled from the current Subscription object for checkout, subscription and invoice events; an invoice event alone must never grant or revoke access from its historical snapshot. The webhook destination must subscribe to checkout completion, subscription created/updated/deleted/paused/resumed, invoice paid, payment failed and payment action required. Checkout creation uses a 30-minute per-user/plan idempotency window to prevent duplicate subscriptions during retries.

Keep `PAYMENTS_MODE=test` through checkout, webhook, cancellation, failed-payment and customer-portal acceptance tests. Only production keys, production price IDs and a separately approved `PAYMENTS_MODE=live` change can satisfy the billing release gate.

## Database backup and restore gate

1. Use a paid managed PostgreSQL plan with point-in-time recovery enabled.
2. Create a separate AES-256-GCM encrypted logical backup on a daily schedule; keep 35 daily and 12 monthly recovery points.
3. Restrict backup access to the director and named technical operator, with MFA.
4. Every quarter, restore the newest backup into an isolated empty database.
5. Run all migrations, compare counts and sample integrity hashes across every durable customer, case, consent, accounting, audit, operational-evidence and deletion-tombstone table.
6. Record restore start/end times, recovery point, evidence, discrepancies and approver. Delete the restore environment securely.

A backup is not considered operational until one restore has succeeded. Never download production dumps to an unmanaged personal device.

Create the encrypted PostgreSQL custom-format archive and its non-personal signed integrity manifest with `pnpm backup:database`. The job exports one repeatable-read PostgreSQL snapshot, uses that same snapshot for `pg_dump` and the keyed integrity samples, encrypts the dump with a separately managed `BACKUP_ARCHIVE_ENCRYPTION_KEY`, uploads the ciphertext first and publishes `manifest.json` only after the archive succeeds. Neither database credentials nor encryption keys may appear in command arguments or logs. The legacy `pnpm backup:manifest` command creates evidence only and is not itself a database backup.

Restore with `pnpm backup:restore-database <manifest-key>` into a separately provisioned empty PostgreSQL database. The command refuses the source database and non-empty targets, validates the manifest signature, ciphertext size/checksum and AES-GCM authentication before invoking `pg_restore`, then compares counts plus HMAC integrity samples across all durable service and deletion-control tables. A discrepancy, altered archive or wrong key exits non-zero. When `BACKUP_RESTORE_EVIDENCE_URL` and its dedicated token are configured, only a completely successful restore reports authenticated evidence to production; partial configuration fails closed. Evidence is bound to the required migration, so a schema change requires a new backup and isolated restore before the gate can reopen. The older `pnpm backup:verify-restore` command verifies an already-restored database against a local manifest but does not perform restoration. Backup recoverability and retention are independent release gates: an isolated restore must be testable before destructive lifecycle expiry is approved, while the retention gate remains closed until its own lifecycle and deletion evidence exists.

## Media storage recovery

Cloudflare R2 does not currently implement the S3 bucket-versioning operations, so R2 versioning must not be claimed as recovery evidence. Keep the primary R2 bucket private and create a second private backup bucket with separate credentials that are unavailable to the web service. Run `pnpm backup:media` from an isolated scheduled backup job with the primary read credentials, backup write credentials, PostgreSQL access and `BACKUP_EVIDENCE_KEY`. The job writes each already application-encrypted object under a unique daily or monthly snapshot prefix and publishes the signed manifest only after every object succeeds.

Configure backup-bucket lifecycle rules for the daily and monthly prefixes under both `content-protect-media/` and `content-protect-database/`, using 35 and 400 days respectively. The backup credentials used by the web application must not exist: only isolated backup/restore jobs may access backup archives, and the normal writer role should not delete them. Public bucket access must remain disabled.

Run `pnpm backup:verify-media <manifest-key>` using backup read credentials and the evidence key. This verifier needs no primary-bucket or database credentials, requires the enabled 35-day daily and 400-day monthly lifecycle rules (or the explicitly approved override values), validates the signed inventory, downloads every encrypted backup object and compares its size and SHA-256 digest. Retain the resulting JSON with the quarterly restore evidence. An absent object, altered manifest, lifecycle mismatch or checksum mismatch exits non-zero. A manifest is not valid recovery evidence until this independent read test succeeds.

Cloudflare capability reference: https://developers.cloudflare.com/r2/api/s3/api/ and lifecycle reference: https://developers.cloudflare.com/r2/buckets/object-lifecycles/

## Deployment and rollback

1. Deploy only a committed main-branch revision after the `Build and policy checks` workflow has passed. It installs the frozen lockfile, runs the offline policy/unit suite, builds the production assets and validates the final Docker image. Dependabot proposes grouped weekly dependency and GitHub Actions updates for review; updates are never deployed solely because they are available.
2. Run migrations through the Blueprint pre-deploy command. `schema_migrations` checksums must match the committed files, and `/api/health/ready` must report the latest required migration before traffic is declared healthy.
3. Run the production verifier and one creator sandbox journey.
4. Roll back the application revision if errors increase. Do not roll back a destructive schema change; use a reviewed forward fix.
5. Record revision, operator, outcome and any incident reference.

## Incident start

For suspected intimate-media, credential, identity or key exposure, declare SEV-1 and follow `docs/compliance/INCIDENT-RESPONSE-PLAN.md`. Revoke affected sessions and provider keys, preserve evidence, and record the UK breach-awareness time. Do not attach intimate media to ordinary support email.
