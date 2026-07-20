BEGIN;

ALTER TABLE consumer_cases
  ADD COLUMN IF NOT EXISTS refund_provider_status text,
  ADD COLUMN IF NOT EXISTS refund_provider_reference text,
  ADD COLUMN IF NOT EXISTS refund_payment_intent_reference text,
  ADD COLUMN IF NOT EXISTS refund_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_provider_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_attempts integer NOT NULL DEFAULT 0;

UPDATE consumer_cases
SET refund_provider_status = CASE
  WHEN refund_completed_at IS NOT NULL THEN 'legacy-recorded'
  WHEN refund_decision IN ('pending','approved','partial') THEN 'not-submitted'
  ELSE 'not-requested'
END
WHERE refund_provider_status IS NULL;

UPDATE consumer_cases
SET status = 'in-review',
    resolved_at = NULL,
    closed_at = NULL,
    updated_at = now()
WHERE category IN ('billing','cooling-off','refund')
  AND status IN ('resolved','closed')
  AND refund_decision = 'pending';

ALTER TABLE consumer_cases
  ALTER COLUMN refund_provider_status SET DEFAULT 'not-requested',
  ALTER COLUMN refund_provider_status SET NOT NULL;

ALTER TABLE consumer_cases
  DROP CONSTRAINT IF EXISTS consumer_cases_refund_provider_status_check,
  ADD CONSTRAINT consumer_cases_refund_provider_status_check CHECK (
    refund_provider_status IN (
      'not-requested','not-submitted','pending','requires-action',
      'succeeded','failed','canceled','legacy-recorded'
    )
  ),
  DROP CONSTRAINT IF EXISTS consumer_cases_refund_provider_reference_check,
  ADD CONSTRAINT consumer_cases_refund_provider_reference_check CHECK (
    refund_provider_reference IS NULL OR
    refund_provider_reference ~ '^re_[A-Za-z0-9]+$'
  ),
  DROP CONSTRAINT IF EXISTS consumer_cases_refund_payment_intent_reference_check,
  ADD CONSTRAINT consumer_cases_refund_payment_intent_reference_check CHECK (
    refund_payment_intent_reference IS NULL OR
    refund_payment_intent_reference ~ '^pi_[A-Za-z0-9]+$'
  ),
  DROP CONSTRAINT IF EXISTS consumer_cases_refund_attempts_check,
  ADD CONSTRAINT consumer_cases_refund_attempts_check CHECK (
    refund_attempts BETWEEN 0 AND 20
  ),
  DROP CONSTRAINT IF EXISTS consumer_cases_verified_refund_check,
  ADD CONSTRAINT consumer_cases_verified_refund_check CHECK (
    refund_provider_status NOT IN (
      'pending','requires-action','succeeded','failed','canceled'
    ) OR (
      refund_provider_reference IS NOT NULL AND
      refund_payment_intent_reference IS NOT NULL AND
      refund_submitted_at IS NOT NULL AND
      refund_provider_updated_at IS NOT NULL AND
      refund_attempts > 0
    )
  ),
  DROP CONSTRAINT IF EXISTS consumer_cases_completed_refund_check,
  ADD CONSTRAINT consumer_cases_completed_refund_check CHECK (
    (refund_provider_status IN ('succeeded','legacy-recorded')) =
    (refund_completed_at IS NOT NULL)
  ),
  DROP CONSTRAINT IF EXISTS consumer_cases_refund_decision_state_check,
  ADD CONSTRAINT consumer_cases_refund_decision_state_check CHECK (
    (
      refund_decision IN ('approved','partial') AND
      refund_amount_pence IS NOT NULL AND
      refund_provider_status IN (
        'not-submitted','pending','requires-action','succeeded',
        'failed','canceled','legacy-recorded'
      )
    ) OR (
      refund_decision = 'pending' AND
      refund_amount_pence IS NULL AND
      refund_provider_status = 'not-submitted'
    ) OR (
      refund_decision IN ('not-requested','declined') AND
      refund_amount_pence IS NULL AND
      refund_provider_status = 'not-requested'
    )
  ),
  DROP CONSTRAINT IF EXISTS consumer_cases_refund_resolution_check,
  ADD CONSTRAINT consumer_cases_refund_resolution_check CHECK (
    category NOT IN ('billing','cooling-off','refund') OR
    status NOT IN ('resolved','closed') OR
    refund_decision <> 'pending'
  ),
  DROP CONSTRAINT IF EXISTS consumer_cases_unsubmitted_refund_check,
  ADD CONSTRAINT consumer_cases_unsubmitted_refund_check CHECK (
    refund_provider_status NOT IN ('not-requested','not-submitted') OR (
      refund_provider_reference IS NULL AND
      refund_payment_intent_reference IS NULL AND
      refund_submitted_at IS NULL AND
      refund_provider_updated_at IS NULL AND
      refund_attempts = 0 AND
      refund_completed_at IS NULL
    )
  );

ALTER TABLE consumer_case_events
  DROP CONSTRAINT IF EXISTS consumer_case_events_event_type_check;

ALTER TABLE consumer_case_events
  ADD CONSTRAINT consumer_case_events_event_type_check CHECK (
    event_type IN (
      'received','acknowledged','information-requested','customer-message',
      'refund-decision','refund-completed','refund-submitted','refund-status-changed',
      'resolved','closed'
    )
  );

COMMIT;
