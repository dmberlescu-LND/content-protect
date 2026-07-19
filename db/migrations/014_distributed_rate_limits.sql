BEGIN;

CREATE TABLE IF NOT EXISTS rate_limits (
  key_hash text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_limits_expires_at_idx
  ON rate_limits(expires_at);

COMMIT;
