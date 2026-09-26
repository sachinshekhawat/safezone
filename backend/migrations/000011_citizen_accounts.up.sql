-- Migration: 000011_citizen_accounts
-- Description: Let citizens hold accounts alongside staff.
--
-- Until now `users` modelled staff only: email + password was mandatory and the
-- role defaulted to 'public' without anything ever creating such a row. A
-- citizen signs in with her phone number and may never have an email, so both
-- email and password_hash become optional and a CHECK guarantees every row
-- still carries at least one usable identity.
--
-- DPDP Act 2023 note: a phone number is personal data, so it is collected only
-- for authentication and emergency callback, and only against a recorded,
-- timestamped consent (see consent_* columns). Consent is stored as
-- "when, against which policy version" rather than a bare boolean — a boolean
-- cannot evidence *what* was agreed to, which is what the Act asks for.
-- This is separate from and does not weaken the rule that no victim PII is
-- stored on incidents.

-- ========================
-- ENUMS
-- ========================

-- 'prefer_not_to_say' exists deliberately: gender tailors safety guidance, but
-- forcing a disclosure to use a safety app would be the wrong trade.
CREATE TYPE gender AS ENUM ('female', 'male', 'other', 'prefer_not_to_say');

CREATE TYPE auth_provider AS ENUM ('password', 'phone_otp', 'google');

-- ========================
-- USERS — citizen fields
-- ========================
ALTER TABLE users
    ADD COLUMN phone VARCHAR(20),
    ADD COLUMN phone_verified_at TIMESTAMPTZ,
    ADD COLUMN gender gender,
    ADD COLUMN city_id UUID REFERENCES cities(id),
    ADD COLUMN auth_provider auth_provider NOT NULL DEFAULT 'password',
    ADD COLUMN google_sub VARCHAR(255),
    ADD COLUMN avatar_url TEXT,
    -- Consent, recorded per purpose so either can be withdrawn on its own.
    ADD COLUMN consent_data_at TIMESTAMPTZ,
    ADD COLUMN consent_location_at TIMESTAMPTZ,
    ADD COLUMN consent_version VARCHAR(20);

-- Citizens have no email and no password; Google users have no password.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- An empty string is not a missing value. Normalise so the partial unique
-- indexes below cannot be defeated by ''.
UPDATE users SET email = NULL WHERE email = '';

ALTER TABLE users
    ADD CONSTRAINT ck_users_has_identity CHECK (
        email IS NOT NULL OR phone IS NOT NULL OR google_sub IS NOT NULL
    );

-- Password login requires a hash; the OTP and Google paths must not have one.
ALTER TABLE users
    ADD CONSTRAINT ck_users_password_provider CHECK (
        (auth_provider = 'password' AND password_hash IS NOT NULL)
        OR (auth_provider <> 'password')
    );

-- Uniqueness must ignore soft-deleted rows, otherwise deleting an account
-- permanently burns that phone number. The original uq_user_email constraint
-- had the same flaw, so it is replaced with a partial index here.
ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_user_email;

CREATE UNIQUE INDEX uq_users_email_live ON users(email)
    WHERE email IS NOT NULL AND deleted_at IS NULL AND is_deleted = FALSE;
CREATE UNIQUE INDEX uq_users_phone_live ON users(phone)
    WHERE phone IS NOT NULL AND deleted_at IS NULL AND is_deleted = FALSE;
CREATE UNIQUE INDEX uq_users_google_sub_live ON users(google_sub)
    WHERE google_sub IS NOT NULL AND deleted_at IS NULL AND is_deleted = FALSE;

-- Named for the column, not the table: 000002 already took idx_users_city for
-- assigned_city_id (the staff posting), which is a different relationship.
CREATE INDEX idx_users_home_city ON users(city_id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN users.phone IS 'E.164 format (+91XXXXXXXXXX). Auth and emergency callback only.';
COMMENT ON COLUMN users.consent_data_at IS 'When the user agreed to data processing. NULL = no consent on file.';
COMMENT ON COLUMN users.consent_location_at IS 'When the user agreed to location use for safety features.';

-- ========================
-- PHONE OTPS
-- ========================
-- Codes are stored as SHA-256 hashes. A plaintext OTP column would let anyone
-- with read access to this table take over an account, and OTPs are short
-- enough that the table is a standing liability if it leaks.
CREATE TABLE phone_otps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) NOT NULL,
    code_hash CHAR(64) NOT NULL,
    purpose VARCHAR(20) NOT NULL DEFAULT 'signin',
    attempts SMALLINT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    -- Kept for abuse investigation, not analytics.
    requested_ip VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup path for "newest live code for this phone".
CREATE INDEX idx_phone_otps_lookup ON phone_otps(phone, created_at DESC)
    WHERE consumed_at IS NULL;
-- Supports the throttle query and the purge below.
CREATE INDEX idx_phone_otps_expiry ON phone_otps(expires_at);

COMMENT ON TABLE phone_otps IS
    'Short-lived phone verification codes, SHA-256 hashed. Purge rows past expiry — they have no analytical value and are personal data.';
