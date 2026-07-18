ALTER TABLE takedown_cases
  ADD COLUMN IF NOT EXISTS recipient_source text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_delivery_error text;

CREATE UNIQUE INDEX IF NOT EXISTS takedown_cases_provider_message_unique
  ON takedown_cases(provider_message_id)
  WHERE provider_message_id IS NOT NULL;
