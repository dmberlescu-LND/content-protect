# Content Protect production infrastructure

## Current release boundary

The container is suitable for staging and product demonstrations. It is not approved for real intimate media until the managed database, object storage, secret manager, backups, monitoring, age verification, provider contracts and security review are complete.

## Recommended UK topology

1. `content-protect.com` and `www.content-protect.com` terminate HTTPS at the edge.
2. Traffic is forwarded to the Content Protect container in a UK region.
3. Application records and sessions move from the local JSON store to managed PostgreSQL.
4. Encrypted reference files move from the local vault to private object storage with application-managed encryption keys. Because Cloudflare R2 does not implement S3 bucket versioning, recovery uses a separate private backup bucket, separate job credentials, signed append-only snapshot manifests and independently verified retention rules.
5. A separate Render cron service executes database retention daily and commits operational evidence atomically. The external GitHub monitor records authenticated heartbeats only after production and SEO checks pass. Both readiness gates expire automatically when evidence becomes stale.
6. Secrets are injected from a managed secret store and are never committed to Git.
7. Audit events are append-only in PostgreSQL and protected by a versioned HMAC chain. The implemented audit-export job writes pseudonymous, compressed, AES-256-GCM-encrypted records and an HMAC-signed manifest to a separately administered S3-compatible bucket using non-overwriting keys, reads the result back and verifies a 400-day lifecycle before recording fresh readiness evidence. Provider selection, isolated credentials and the custody/DPA/transfer approval are still required.
8. Backups are encrypted, tested and kept in a separate account or recovery boundary.

## Deployment order

1. Create a private GitHub repository under the company account.
2. Push the reviewed source without `.env` or `.traceguard-data`.
3. Create staging infrastructure in a UK region.
4. Deploy with `PAYMENTS_MODE=test`, `TAKEDOWNS_MODE=sandbox`, `YOTI_MODE=sandbox` and `BIOMETRICS_ENABLED=false`.
5. Run authentication, upload, deletion, backup-restore and incident-response tests.
6. Connect a temporary staging hostname.
7. Only after the corresponding provider, legal and operational approvals, change each integration independently to its explicit `live` mode. Credentials alone do not open a production gate.
8. Only after approval, add the production DNS records in Porkbun.

## Porkbun DNS later

Do not enter placeholder IP addresses. The final deployment provider will supply either an A/AAAA target or a CNAME. Configure apex, `www`, email verification, SPF, DKIM and DMARC only from verified provider values.
