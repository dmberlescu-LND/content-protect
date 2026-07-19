ALTER TABLE takedown_cases
  ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false;

ALTER TABLE users ALTER COLUMN plan SET DEFAULT 'Unsubscribed';

CREATE INDEX IF NOT EXISTS takedown_cases_retention_idx
  ON takedown_cases(closed_at)
  WHERE closed_at IS NOT NULL AND legal_hold = false;

CREATE TABLE IF NOT EXISTS accounting_records (
  id bigserial PRIMARY KEY,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  former_user_hash text NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  retained_until timestamptz NOT NULL,
  UNIQUE(source_type, source_id)
);

CREATE INDEX IF NOT EXISTS accounting_records_retention_idx
  ON accounting_records(retained_until);
