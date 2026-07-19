# Content Protect production operations runbook

Status: operational baseline. External alert destinations and a verified database restore remain release gates.

## Service-level targets

- Public application availability target: 99.9% monthly after commercial launch.
- Liveness check: `GET /api/health/live` every minute.
- Readiness check: `GET /api/health/ready` every minute.
- Alert when readiness fails twice consecutively, the 5xx rate exceeds 2% for five minutes, or p95 response time exceeds two seconds for ten minutes.
- SEV-1 acknowledgement target: 15 minutes. SEV-2: 60 minutes. SEV-3: next business day.

The readiness endpoint checks PostgreSQL and the configured private storage without writing customer data. `productionReady` is deliberately false until PostgreSQL, private object storage, scanning, age verification, operator-reviewed delivery and Stripe are all configured.

Real takedown delivery also remains disabled until specialist counsel approves the exact notice template. After approval, record the approved version in Render as `TAKEDOWN_LEGAL_APPROVED_VERSION=2026-07-18`. Never advance this value merely to make the readiness check green; a template change requires a new review and version.

## Logs and correlation

The service emits one JSON event per request with UTC platform timestamp, request ID, method, path, status and duration. Error events contain the same request ID. Query Render logs using `requestId`; do not log request bodies, cookies, tokens, email addresses or private media.

Keep application/security logs for 12 months, with access restricted to authorised operators. Export logs to a separate retained destination before relying on them for incident evidence.

## Daily checks

1. Run `pnpm run verify:production` against the primary domain.
2. Review readiness, 5xx count, latency and restart events.
3. Review failed Stripe, Resend, scanner and age-provider webhooks.
4. Review the operator case queue and overdue actions without opening private media unnecessarily.
5. Run `pnpm retention:preview` and investigate unexpected volumes. The destructive command remains disabled unless the approved scheduler supplies `RETENTION_EXECUTION_ENABLED=true`; never enable it before migrations and a reviewed preview.
5. Confirm no provider credentials or customer data appeared in logs.

## Database backup and restore gate

1. Use a paid managed PostgreSQL plan with point-in-time recovery enabled.
2. Create a separate encrypted logical backup on a daily schedule; keep 35 daily and 12 monthly recovery points.
3. Restrict backup access to the director and named technical operator, with MFA.
4. Every quarter, restore the newest backup into an isolated empty database.
5. Run all migrations, compare counts for users, assets, cases, events and subscriptions, and sample integrity hashes.
6. Record restore start/end times, recovery point, evidence, discrepancies and approver. Delete the restore environment securely.

A backup is not considered operational until one restore has succeeded. Never download production dumps to an unmanaged personal device.

## Media storage recovery

Enable private bucket versioning and lifecycle rules. Test recovery with disposable encrypted objects only: upload, read, compare checksum, delete, restore the prior version, compare again, then permanently purge the test object. Public bucket access must remain disabled.

## Deployment and rollback

1. Deploy only a committed main-branch revision after syntax and production build checks.
2. Run migrations through the Blueprint pre-deploy command. `schema_migrations` checksums must match the committed files, and `/api/health/ready` must report the latest required migration before traffic is declared healthy.
3. Run the production verifier and one creator sandbox journey.
4. Roll back the application revision if errors increase. Do not roll back a destructive schema change; use a reviewed forward fix.
5. Record revision, operator, outcome and any incident reference.

## Incident start

For suspected intimate-media, credential, identity or key exposure, declare SEV-1 and follow `docs/compliance/INCIDENT-RESPONSE-PLAN.md`. Revoke affected sessions and provider keys, preserve evidence, and record the UK breach-awareness time. Do not attach intimate media to ordinary support email.
