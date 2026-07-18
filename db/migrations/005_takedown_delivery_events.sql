ALTER TABLE takedown_cases
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_provider_event_at timestamptz;

CREATE INDEX IF NOT EXISTS takedown_cases_delivery_status_idx
  ON takedown_cases(delivery_status, next_action_at);
