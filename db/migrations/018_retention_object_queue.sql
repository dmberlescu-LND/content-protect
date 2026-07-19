BEGIN;

CREATE TABLE IF NOT EXISTS object_deletion_queue (
  id bigserial PRIMARY KEY,
  object_key text NOT NULL UNIQUE CHECK (length(object_key) BETWEEN 3 AND 500),
  reason text NOT NULL CHECK (
    reason IN ('asset-deleted','asset-retention-expired','unverified-account-expired')
  ),
  queued_at timestamptz NOT NULL DEFAULT now(),
  deletion_attempts integer NOT NULL DEFAULT 0 CHECK (deletion_attempts >= 0),
  last_attempt_at timestamptz,
  last_error text,
  lease_owner text,
  lease_until timestamptz,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS object_deletion_queue_pending_idx
  ON object_deletion_queue(queued_at, id)
  WHERE deleted_at IS NULL;

COMMIT;
