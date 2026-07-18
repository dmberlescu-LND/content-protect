ALTER TABLE takedown_cases
  ADD COLUMN IF NOT EXISTS target_url text,
  ADD COLUMN IF NOT EXISTS target_host text,
  ADD COLUMN IF NOT EXISTS notice_type text NOT NULL DEFAULT 'copyright',
  ADD COLUMN IF NOT EXISTS evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS evidence_hash text,
  ADD COLUMN IF NOT EXISTS notice_draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS declarations jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS takedown_cases_user_match_unique
  ON takedown_cases(user_id, match_id);
CREATE INDEX IF NOT EXISTS takedown_cases_user_status_updated_idx
  ON takedown_cases(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS case_events_case_created_idx
  ON case_events(case_id, created_at ASC);
