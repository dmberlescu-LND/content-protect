BEGIN;

CREATE TABLE IF NOT EXISTS operational_evidence (
  id bigserial PRIMARY KEY,
  evidence_type text NOT NULL CHECK (evidence_type IN ('monitoring','retention')),
  status text NOT NULL CHECK (status IN ('succeeded','failed')),
  source text NOT NULL,
  release text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operational_evidence_latest_idx
  ON operational_evidence(evidence_type, status, occurred_at DESC);

COMMIT;
