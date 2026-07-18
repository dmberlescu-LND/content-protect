CREATE TABLE IF NOT EXISTS operator_sessions (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operator_sessions_expires_idx
  ON operator_sessions(expires_at);
