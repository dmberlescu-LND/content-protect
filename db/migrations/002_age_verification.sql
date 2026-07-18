BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS eligibility_accepted_at timestamptz;

UPDATE users
SET eligibility_accepted_at = age_verified_at
WHERE eligibility_accepted_at IS NULL
  AND age_verified_at IS NOT NULL;

-- Earlier builds used age_verified_at for a self-declaration. A provider result
-- is required before this field may be populated in production.
UPDATE users SET age_verified_at = NULL
WHERE age_verified_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM verification_records v
    WHERE v.user_id = users.id
      AND v.kind = 'age'
      AND v.status = 'verified'
  );

COMMIT;
