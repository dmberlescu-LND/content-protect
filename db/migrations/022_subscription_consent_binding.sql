BEGIN;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS billing_consent_id uuid;

UPDATE subscriptions
SET status = 'unverified', updated_at = now()
WHERE stripe_subscription_id IS NOT NULL
  AND billing_consent_id IS NULL
  AND status IN ('active','trialing');

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_billing_consent_id_fkey,
  ADD CONSTRAINT subscriptions_billing_consent_id_fkey
    FOREIGN KEY (billing_consent_id) REFERENCES billing_consents(id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  DROP CONSTRAINT IF EXISTS subscriptions_entitled_consent_check,
  ADD CONSTRAINT subscriptions_entitled_consent_check CHECK (
    status NOT IN ('active','trialing') OR
    stripe_subscription_id IS NULL OR
    billing_consent_id IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS subscriptions_billing_consent_idx
  ON subscriptions(billing_consent_id)
  WHERE billing_consent_id IS NOT NULL;

COMMIT;
