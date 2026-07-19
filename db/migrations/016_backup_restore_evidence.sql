BEGIN;

ALTER TABLE operational_evidence
  DROP CONSTRAINT IF EXISTS operational_evidence_evidence_type_check;

ALTER TABLE operational_evidence
  ADD CONSTRAINT operational_evidence_evidence_type_check
  CHECK (evidence_type IN ('monitoring','retention','backup_restore'));

COMMIT;
