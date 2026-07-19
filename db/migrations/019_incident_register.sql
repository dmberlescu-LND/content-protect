BEGIN;

CREATE TABLE IF NOT EXISTS security_incidents (
  id uuid PRIMARY KEY,
  severity text NOT NULL CHECK (severity IN ('SEV-1','SEV-2','SEV-3')),
  status text NOT NULL CHECK (status IN ('declared','contained','recovered','closed')),
  personal_data_status text NOT NULL CHECK (
    personal_data_status IN ('assessing','not-a-breach','personal-data-breach')
  ),
  aware_at timestamptz,
  ico_deadline_at timestamptz,
  ico_decision text NOT NULL CHECK (
    ico_decision IN ('pending','required','not-required','completed')
  ),
  subjects_decision text NOT NULL CHECK (
    subjects_decision IN ('pending','required','not-required','completed')
  ),
  restricted_details_ciphertext text NOT NULL,
  occurred_at timestamptz NOT NULL,
  closed_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (
    personal_data_status <> 'personal-data-breach'
    OR (aware_at IS NOT NULL AND ico_deadline_at = aware_at + interval '72 hours')
  ),
  CHECK (status <> 'closed' OR closed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS security_incidents_open_deadline_idx
  ON security_incidents(ico_deadline_at, severity)
  WHERE status <> 'closed';

CREATE TABLE IF NOT EXISTS security_incident_events (
  id bigserial PRIMARY KEY,
  event_uuid uuid NOT NULL UNIQUE,
  incident_id uuid NOT NULL REFERENCES security_incidents(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN (
      'assessment','containment','evidence-preserved','processor-contacted',
      'recovery','communication','corrective-action'
    )
  ),
  restricted_details_ciphertext text NOT NULL,
  actor_reference text NOT NULL CHECK (length(actor_reference) BETWEEN 3 AND 80),
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS security_incident_events_timeline_idx
  ON security_incident_events(incident_id, created_at, id);

CREATE OR REPLACE FUNCTION protect_security_incident_events_from_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND
     current_setting('content_protect.incident_retention', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'security incident events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS security_incident_events_append_only
  ON security_incident_events;
CREATE TRIGGER security_incident_events_append_only
BEFORE UPDATE OR DELETE ON security_incident_events
FOR EACH ROW EXECUTE FUNCTION protect_security_incident_events_from_mutation();

COMMIT;
