# Production data migration runbook

The application must remain in sandbox mode until this runbook is completed and verified.

## Target

- Managed PostgreSQL in the same Render region as the application.
- Private S3-compatible object storage (recommended: Cloudflare R2) with public access disabled.
- Application-layer AES-256-GCM encryption remains enabled before any media leaves the application.
- Paid PostgreSQL plan with point-in-time recovery and separate logical exports.

## Safe activation order

1. Create the paid PostgreSQL instance and restrict its public inbound rules.
2. Apply `db/migrations/001_production_schema.sql` to an empty database.
3. Create a private object-storage bucket. Do not enable a public development URL or custom public domain.
4. Create credentials restricted to that single bucket and object read/write/delete operations.
5. Add `DATABASE_URL` and the five `OBJECT_STORAGE_*` variables in Render without exposing values in Git.
6. Deploy with `PAYMENTS_MODE=sandbox`, `TAKEDOWNS_MODE=sandbox`, and `BIOMETRICS_ENABLED=false`.
7. Export the existing JSON database and encrypted vault disk before migration.
8. Run the migration once, compare user/asset/case/subscription counts and verify checksums.
9. Upload and delete a disposable test image; confirm no public bucket access is possible.
10. Create a PostgreSQL logical export and test a restore into a separate empty database.

## Release gate

Do not accept real intimate media until the database migration, object-storage test, restore test, retention rules, provider agreements and security review are complete.
