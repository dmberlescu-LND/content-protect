BEGIN;

CREATE TABLE IF NOT EXISTS consumer_cases (
  id uuid PRIMARY KEY,
  reference text NOT NULL UNIQUE CHECK (reference ~ '^CP-[A-F0-9]{12}$'),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  subject_hash char(64) NOT NULL CHECK (subject_hash ~ '^[a-f0-9]{64}$'),
  category text NOT NULL CHECK (
    category IN (
      'billing','cancellation','cooling-off','refund','service','privacy',
      'accessibility','safety','other'
    )
  ),
  priority text NOT NULL CHECK (priority IN ('standard','urgent')),
  status text NOT NULL CHECK (
    status IN (
      'open','acknowledged','in-review','awaiting-customer','resolved','closed'
    )
  ),
  refund_decision text NOT NULL CHECK (
    refund_decision IN ('not-requested','pending','approved','partial','declined')
  ),
  refund_amount_pence integer CHECK (
    refund_amount_pence IS NULL OR
    (refund_amount_pence BETWEEN 1 AND 100000000)
  ),
  refund_completed_at timestamptz,
  response_due_at timestamptz NOT NULL,
  resolution_due_at timestamptz NOT NULL,
  restricted_details_ciphertext text NOT NULL CHECK (
    length(restricted_details_ciphertext) >= 40
  ),
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (resolution_due_at >= response_due_at),
  CHECK (status NOT IN ('resolved','closed') OR resolved_at IS NOT NULL),
  CHECK (status <> 'closed' OR closed_at IS NOT NULL),
  CHECK (
    refund_decision NOT IN ('approved','partial') OR
    refund_amount_pence IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS consumer_cases_open_due_idx
  ON consumer_cases(priority, response_due_at, resolution_due_at)
  WHERE status NOT IN ('resolved','closed');

CREATE INDEX IF NOT EXISTS consumer_cases_user_created_idx
  ON consumer_cases(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS consumer_case_events (
  id bigserial PRIMARY KEY,
  event_uuid uuid NOT NULL UNIQUE,
  consumer_case_id uuid NOT NULL REFERENCES consumer_cases(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN (
      'received','acknowledged','information-requested','customer-message',
      'refund-decision','refund-completed','resolved','closed'
    )
  ),
  actor_type text NOT NULL CHECK (actor_type IN ('customer','operator','system')),
  actor_reference text NOT NULL CHECK (length(actor_reference) BETWEEN 3 AND 80),
  restricted_details_ciphertext text NOT NULL CHECK (
    length(restricted_details_ciphertext) >= 40
  ),
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS consumer_case_events_timeline_idx
  ON consumer_case_events(consumer_case_id, created_at, id);

CREATE OR REPLACE FUNCTION protect_consumer_case_events_from_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND
     current_setting('content_protect.consumer_case_retention', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'consumer case events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS consumer_case_events_append_only
  ON consumer_case_events;
CREATE TRIGGER consumer_case_events_append_only
BEFORE UPDATE OR DELETE ON consumer_case_events
FOR EACH ROW EXECUTE FUNCTION protect_consumer_case_events_from_mutation();

COMMIT;
