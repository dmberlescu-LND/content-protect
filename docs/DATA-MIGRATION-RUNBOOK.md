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
6. Deploy with `PAYMENTS_MODE=test`, `TAKEDOWNS_MODE=sandbox`, `YOTI_MODE=sandbox`, and `BIOMETRICS_ENABLED=false`.
7. Export the existing JSON database and encrypted vault disk before migration.
8. Run `pnpm run storage:migrate` from a private Render Shell. It copies every encrypted vault object, reads it back and compares its encrypted SHA-256 checksum. The command fails if any local source is missing or any remote checksum differs. It deliberately preserves every local original.
9. Save the JSON migration report as deployment evidence and confirm that `assetsDiscovered`, `assetsCopied` and `encryptedChecksumsVerified` are equal with an empty `failures` array.
10. Run `pnpm run test:storage` to upload, read, verify and delete a disposable object; confirm no public bucket access is possible.
11. Create a PostgreSQL logical export and test a restore into a separate empty database.
12. Keep the local encrypted vault as a restricted rollback copy until the R2 migration and restore evidence has been approved. Remove it later through a separately authorised retention procedure, never through the migration command.

## Release gate

Do not accept real intimate media until the database migration, object-storage test, restore test, retention rules, provider agreements and security review are complete.
