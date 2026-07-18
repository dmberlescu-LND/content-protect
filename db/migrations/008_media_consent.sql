ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS sensitive_media_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sensitive_media_consent_version text;
