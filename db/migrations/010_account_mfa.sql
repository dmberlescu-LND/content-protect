ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_secret_ciphertext text,
  ADD COLUMN IF NOT EXISTS mfa_enabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS mfa_recovery_hashes jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS users_mfa_enabled_idx
  ON users(mfa_enabled_at) WHERE mfa_enabled_at IS NOT NULL;
