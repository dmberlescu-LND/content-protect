ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_livemode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

CREATE INDEX IF NOT EXISTS subscriptions_stripe_mode_status_idx
  ON subscriptions(stripe_livemode, status);
