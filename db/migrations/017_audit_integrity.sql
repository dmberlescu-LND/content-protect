BEGIN;

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS event_uuid uuid,
  ADD COLUMN IF NOT EXISTS sequence_no bigint,
  ADD COLUMN IF NOT EXISTS actor_hash text,
  ADD COLUMN IF NOT EXISTS previous_hash text,
  ADD COLUMN IF NOT EXISTS event_hash text,
  ADD COLUMN IF NOT EXISTS hash_version smallint;

CREATE UNIQUE INDEX IF NOT EXISTS audit_events_event_uuid_idx
  ON audit_events(event_uuid) WHERE event_uuid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS audit_events_sequence_no_idx
  ON audit_events(sequence_no) WHERE sequence_no IS NOT NULL;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_hash_version_check,
  ADD CONSTRAINT audit_events_hash_version_check
    CHECK (hash_version IS NULL OR hash_version = 1),
  DROP CONSTRAINT IF EXISTS audit_events_actor_hash_check,
  ADD CONSTRAINT audit_events_actor_hash_check
    CHECK (actor_hash IS NULL OR actor_hash ~ '^[a-f0-9]{64}$'),
  DROP CONSTRAINT IF EXISTS audit_events_previous_hash_check,
  ADD CONSTRAINT audit_events_previous_hash_check
    CHECK (previous_hash IS NULL OR previous_hash ~ '^[a-f0-9]{64}$'),
  DROP CONSTRAINT IF EXISTS audit_events_event_hash_check,
  ADD CONSTRAINT audit_events_event_hash_check
    CHECK (event_hash IS NULL OR event_hash ~ '^[a-f0-9]{64}$'),
  DROP CONSTRAINT IF EXISTS audit_events_protection_complete_check,
  ADD CONSTRAINT audit_events_protection_complete_check CHECK (
    hash_version IS NULL OR (
      event_uuid IS NOT NULL AND sequence_no IS NOT NULL AND sequence_no > 0 AND
      actor_hash IS NOT NULL AND event_hash IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION protect_audit_events_from_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('content_protect.audit_retention', true) = 'on' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'audit events are append-only';
  END IF;

  IF OLD.hash_version IS NULL AND NEW.hash_version = 1 AND
     OLD.user_id IS NOT DISTINCT FROM NEW.user_id AND
     OLD.action IS NOT DISTINCT FROM NEW.action AND
     OLD.details IS NOT DISTINCT FROM NEW.details AND
     OLD.ip_hash IS NOT DISTINCT FROM NEW.ip_hash AND
     OLD.created_at IS NOT DISTINCT FROM NEW.created_at THEN
    RETURN NEW;
  END IF;

  IF OLD.hash_version = 1 AND NEW.hash_version = 1 AND
     OLD.user_id IS NOT NULL AND NEW.user_id IS NULL AND
     OLD.action IS NOT DISTINCT FROM NEW.action AND
     OLD.details IS NOT DISTINCT FROM NEW.details AND
     OLD.ip_hash IS NOT DISTINCT FROM NEW.ip_hash AND
     OLD.created_at IS NOT DISTINCT FROM NEW.created_at AND
     OLD.event_uuid IS NOT DISTINCT FROM NEW.event_uuid AND
     OLD.sequence_no IS NOT DISTINCT FROM NEW.sequence_no AND
     OLD.actor_hash IS NOT DISTINCT FROM NEW.actor_hash AND
     OLD.previous_hash IS NOT DISTINCT FROM NEW.previous_hash AND
     OLD.event_hash IS NOT DISTINCT FROM NEW.event_hash THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'protected audit events cannot be modified';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;
CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION protect_audit_events_from_mutation();

COMMIT;
