CREATE TABLE IF NOT EXISTS billing_consents (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan text NOT NULL,
  terms_version text NOT NULL,
  immediate_service_requested boolean NOT NULL,
  cooling_off_acknowledged boolean NOT NULL,
  stripe_checkout_session_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_consents_user_created_idx
  ON billing_consents(user_id, created_at DESC);
