-- Rollback: 000011_citizen_accounts

DROP TABLE IF EXISTS phone_otps;

DROP INDEX IF EXISTS idx_users_home_city;
DROP INDEX IF EXISTS uq_users_google_sub_live;
DROP INDEX IF EXISTS uq_users_phone_live;
DROP INDEX IF EXISTS uq_users_email_live;

ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_password_provider;
ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_has_identity;

-- Restoring NOT NULL on email/password_hash would fail against any citizen row
-- created since this migration ran, so drop those rows first. They cannot be
-- represented in the pre-migration schema at all — rolling back is a data-losing
-- operation by nature and pretending otherwise would leave the migration stuck
-- half-applied.
DELETE FROM users WHERE email IS NULL OR password_hash IS NULL;

ALTER TABLE users
    DROP COLUMN IF EXISTS consent_version,
    DROP COLUMN IF EXISTS consent_location_at,
    DROP COLUMN IF EXISTS consent_data_at,
    DROP COLUMN IF EXISTS avatar_url,
    DROP COLUMN IF EXISTS google_sub,
    DROP COLUMN IF EXISTS auth_provider,
    DROP COLUMN IF EXISTS city_id,
    DROP COLUMN IF EXISTS gender,
    DROP COLUMN IF EXISTS phone_verified_at,
    DROP COLUMN IF EXISTS phone;

ALTER TABLE users ALTER COLUMN email SET NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;

ALTER TABLE users ADD CONSTRAINT uq_user_email UNIQUE (email);

DROP TYPE IF EXISTS auth_provider;
DROP TYPE IF EXISTS gender;
