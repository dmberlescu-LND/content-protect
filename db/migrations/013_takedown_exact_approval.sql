ALTER TABLE takedown_cases
  ADD COLUMN IF NOT EXISTS legal_basis text,
  ADD COLUMN IF NOT EXISTS prepared_notice_hash text,
  ADD COLUMN IF NOT EXISTS prepared_at timestamptz;

CREATE INDEX IF NOT EXISTS takedown_cases_status_prepared_idx
  ON takedown_cases(status, prepared_at DESC);

UPDATE takedown_cases
SET status = 'Awaiting operator preparation',
    declarations = '{}'::jsonb,
    approved_at = NULL,
    updated_at = now()
WHERE status = 'Awaiting declarations'
   OR (
     status = 'Approved — delivery pending'
     AND (recipient_email IS NULL OR recipient_source IS NULL)
   );
