# Content Protect production operations runbook

Status: operational baseline. External alert destinations and a verified database restore remain release gates.

## Service-level targets

- Public application availability target: 99.9% monthly after commercial launch.
- Liveness check: `GET /api/health/live` every minute.
- Readiness check: `GET /api/health/ready` every minute.
- Alert when readiness fails twice consecutively, the 5xx rate exceeds 2% for five minutes, or p95 response time exceeds two seconds for ten minutes.
- SEV-1 acknowledgement target: 15 minutes. SEV-2: 60 minutes. SEV-3: next business day.

The readiness endpoint checks PostgreSQL, the latest required migration, private storage and external key configuration without writing customer data. It returns HTTP 503 and `status: degraded` when any of those infrastructure checks fails; local JSON or local disk can never pass the production readiness probe. `productionReady` is deliberately false until scanning, age verification, operator-reviewed delivery, Stripe, successful recent retention evidence, successful recent external-monitor evidence and recent restore evidence are present. Manual boolean switches do not satisfy these operational gates.

Yoti age assurance uses the official signed Digital Identity SDK. Configure both `YOTI_SDK_ID` and the PEM private key in `YOTI_PRIVATE_KEY`; an API key is not a substitute. The policy requests only the derived `age_over:18` attribute and rejects self-asserted evidence. Missing or invalid credentials disable the age-check flow without making the application unavailable. Keep the production readiness gate closed until Yoti approves the organisation/application and a real end-to-end receipt test passes.

Authentication, password reset, verification, MFA, sensitive downloads, exports and operator actions use database-backed rate limits in production. Limit keys are HMAC-SHA-256 pseudonyms derived with the external master key, shared by every application instance and expired by the retention job. Login protection applies both an account limit and a broader IP limit, so distributed password attacks and shared networks are handled independently. An application restart must never clear an attacker's accumulated attempts.

Set `MONITORING_CONFIGURED=true` only after the alert destination receives a real test alert. Set `BACKUP_RESTORE_VERIFIED_AT` to the UTC completion timestamp only after an isolated restore has passed the checks below; readiness expires that evidence after 100 days. Set `RETENTION_EXECUTION_ENABLED=true` only when the approved scheduled job is installed and its reviewed preview matches expectations. These flags record completed evidence; they are not substitutes for completing the work.

### External production monitor

The repository workflow `.github/workflows/production-monitor.yml` checks the public domain from infrastructure independent of Render every five minutes. It validates liveness, PostgreSQL readiness, private object storage, the required migration, TLS-facing security headers, legal pages and SEO. A single failed run is retried after 60 seconds so an alert represents two consecutive failures.

To commission the alert route, open **GitHub → Actions → Production monitor → Run workflow**, enable **Fail after the checks to test alert delivery**, and run it. Confirm that the named on-call recipient receives the failed-workflow notification, then run it again without the failure option and confirm a green result. Only after both results are recorded may `MONITORING_CONFIGURED=true` be set in Render. GitHub notification settings must keep Actions failure notifications enabled for the on-call account.

Real takedown delivery also remains disabled until specialist counsel approves the exact notice template. After approval, record the approved version in Render as `TAKEDOWN_LEGAL_APPROVED_VERSION=2026-07-19-v2`. Never advance this value merely to make the readiness check green; a template change requires a new review and version.

## Logs and correlation

The service emits one JSON event per request with UTC platform timestamp, request ID, method, path, status and duration. Error events contain the same request ID. Query Render logs using `requestId`; do not log request bodies, cookies, tokens, email addresses or private media.

Keep application/security logs for 12 months, with access restricted to authorised operators. Export logs to a separate retained destination before relying on them for incident evidence.

## Daily checks

1. Run `pnpm run verify:production` against the primary domain.
2. Review readiness, 5xx count, latency and restart events.
3. Review failed Stripe, Resend, scanner and age-provider webhooks.
4. Review the operator case queue and overdue actions without opening private media unnecessarily.
5. Run `pnpm retention:preview` and investigate unexpected volumes. The destructive command remains disabled unless the approved scheduler supplies `RETENTION_EXECUTION_ENABLED=true`; never enable it before migrations and a reviewed preview.
6. The Blueprint defines `content-protect-retention` at 03:17 UTC daily. It receives `DATABASE_URL` from the web service through Render's service reference and records a successful database evidence row in the same transaction as deletion. Readiness accepts only a successful result less than 36 hours old. A failed or absent job therefore closes the gate automatically.

## External monitoring evidence

The GitHub production monitor runs public production and SEO checks every five minutes. After both checks succeed, it calls the machine-only heartbeat endpoint with `MONITORING_HEARTBEAT_TOKEN`; the same random value must be stored as a Render environment secret and a GitHub Actions repository secret. The endpoint applies constant-time credential comparison, rate limiting and server-side timestamps. Readiness accepts only successful evidence less than 15 minutes old. Never place the token in source code or workflow logs. 6. Confirm no provider credentials or customer data appeared in logs.

Stripe access is reconciled from the current Subscription object for checkout, subscription and invoice events; an invoice event alone must never grant or revoke access from its historical snapshot. The webhook destination must subscribe to checkout completion, subscription created/updated/deleted/paused/resumed, invoice paid, payment failed and payment action required. Checkout creation uses a 30-minute per-user/plan idempotency window to prevent duplicate subscriptions during retries.

## Database backup and restore gate

1. Use a paid managed PostgreSQL plan with point-in-time recovery enabled.
2. Create a separate encrypted logical backup on a daily schedule; keep 35 daily and 12 monthly recovery points.
3. Restrict backup access to the director and named technical operator, with MFA.
4. Every quarter, restore the newest backup into an isolated empty database.
5. Run all migrations, compare counts for users, assets, cases, events and subscriptions, and sample integrity hashes.
6. Record restore start/end times, recovery point, evidence, discrepancies and approver. Delete the restore environment securely.

A backup is not considered operational until one restore has succeeded. Never download production dumps to an unmanaged personal device.

Create the non-personal, signed integrity manifest beside each logical backup by running `pnpm backup:manifest` with the production `DATABASE_URL` and a separately managed `BACKUP_EVIDENCE_KEY` of at least 32 characters. Store the JSON manifest with the encrypted backup; it contains counts and keyed integrity samples, not customer records. Capture the manifest as part of the same controlled backup operation so its timestamp identifies the recovery point.

After restoring into an isolated empty PostgreSQL database, run `pnpm backup:verify-restore /secure/path/manifest.json` with only `RESTORE_DATABASE_URL` and the same `BACKUP_EVIDENCE_KEY`. The verifier refuses the source database, runs a repeatable-read/read-only transaction, requires the current migration, validates the manifest signature, and compares counts plus HMAC integrity samples for users, assets, takedown cases, audit events and subscriptions. A discrepancy or altered manifest exits non-zero. Review and retain its JSON evidence before setting `BACKUP_RESTORE_VERIFIED_AT` to the successful `completedAt`; never set the flag from the manifest-creation step.

## Media storage recovery

Cloudflare R2 does not currently implement the S3 bucket-versioning operations, so R2 versioning must not be claimed as recovery evidence. Keep the primary R2 bucket private and create a second private backup bucket with separate credentials that are unavailable to the web service. Run `pnpm backup:media` from an isolated scheduled backup job with the primary read credentials, backup write credentials, PostgreSQL access and `BACKUP_EVIDENCE_KEY`. The job writes each already application-encrypted object under a unique daily or monthly snapshot prefix and publishes the signed manifest only after every object succeeds.

Configure backup-bucket lifecycle rules for `content-protect-media/daily/` and `content-protect-media/monthly/` according to the approved 35-daily/12-monthly retention schedule. The backup credentials used by the web application must not exist: only the isolated backup job may write snapshots, and its normal role should not delete them. Public bucket access must remain disabled.

Run `pnpm backup:verify-media <manifest-key>` using backup read credentials and the evidence key. This verifier needs no primary-bucket or database credentials, requires the enabled 35-day daily and 400-day monthly lifecycle rules (or the explicitly approved override values), validates the signed inventory, downloads every encrypted backup object and compares its size and SHA-256 digest. Retain the resulting JSON with the quarterly restore evidence. An absent object, altered manifest, lifecycle mismatch or checksum mismatch exits non-zero. A manifest is not valid recovery evidence until this independent read test succeeds.

Cloudflare capability reference: https://developers.cloudflare.com/r2/api/s3/api/ and lifecycle reference: https://developers.cloudflare.com/r2/buckets/object-lifecycles/

## Deployment and rollback

1. Deploy only a committed main-branch revision after syntax and production build checks.
2. Run migrations through the Blueprint pre-deploy command. `schema_migrations` checksums must match the committed files, and `/api/health/ready` must report the latest required migration before traffic is declared healthy.
3. Run the production verifier and one creator sandbox journey.
4. Roll back the application revision if errors increase. Do not roll back a destructive schema change; use a reviewed forward fix.
5. Record revision, operator, outcome and any incident reference.

## Incident start

For suspected intimate-media, credential, identity or key exposure, declare SEV-1 and follow `docs/compliance/INCIDENT-RESPONSE-PLAN.md`. Revoke affected sessions and provider keys, preserve evidence, and record the UK breach-awareness time. Do not attach intimate media to ordinary support email.
