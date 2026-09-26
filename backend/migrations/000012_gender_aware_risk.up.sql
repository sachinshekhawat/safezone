-- Migration: 000012_gender_aware_risk
-- Description: Make risk answerable for men as well as women.
--
-- ## Why this column has to exist first
--
-- The platform can currently say nothing about how risk differs by gender, and
-- not because the model is too simple: `incidents` has no gender field at all.
-- Every incident_type in the enum (assault, harassment, stalking, kidnapping,
-- domestic_violence) came from the women-safety framing the project was built
-- around, and `demographic_data` carries female population and female literacy
-- but nothing comparable for men.
--
-- So no amount of modelling can *learn* a men's risk score from what is stored
-- today. Adding victim_gender is the precondition: until it is recorded and
-- populated, any difference between a men's and a women's score is a stated
-- assumption rather than a finding, and the application labels it that way.
--
-- 'unknown' is the default rather than NULL-as-unknown because a great many
-- public records genuinely do not state it, and an explicit value stops that
-- being confused with "not yet backfilled".
--
-- DPDP Act 2023 / BNS 228A: gender at the level of an already-anonymised,
-- zone-aggregated incident is not identifying on its own, and no name, address
-- or FIR number is stored alongside it. This does not change the rule that
-- victim identities are never held.

CREATE TYPE victim_gender AS ENUM ('female', 'male', 'other', 'unknown');

ALTER TABLE incidents
    ADD COLUMN victim_gender victim_gender NOT NULL DEFAULT 'unknown';

-- Supports the per-gender aggregation the risk profiles and the incremental
-- learner both run. Partial, because deleted rows never take part in scoring.
CREATE INDEX idx_incidents_victim_gender ON incidents(victim_gender)
    WHERE deleted_at IS NULL AND is_deleted = FALSE;

-- Composite for "count by gender and time band in this zone", which is the exact
-- shape the training query needs.
CREATE INDEX idx_incidents_zone_gender_time
    ON incidents(zone_id, victim_gender, time_of_day)
    WHERE deleted_at IS NULL AND is_deleted = FALSE;

COMMENT ON COLUMN incidents.victim_gender IS
    'Self-evident from the source record where stated, otherwise ''unknown''. Aggregate use only — never combined with anything identifying.';

-- ========================
-- PER-PROFILE SCORES
-- ========================
-- risk_scores.overall_score stays the single headline number so nothing that
-- reads it today changes behaviour. Per-profile results go in a JSONB column
-- rather than new columns because the set of profiles is expected to change, and
-- an ALTER per profile would be worse than a documented shape.
--
-- Shape: {"general": {"score": 41.2, "level": "moderate"},
--         "women":   {"score": 55.8, "level": "moderate"},
--         "source": "incremental_sgd_v3", "trained_at": "2026-09-26T12:00:00Z"}
ALTER TABLE risk_scores
    ADD COLUMN profile_scores JSONB;

COMMENT ON COLUMN risk_scores.profile_scores IS
    'Per-audience scores keyed by profile name, written by the ML pipeline. NULL means only the headline overall_score is available and clients must fall back to the documented profile model.';

-- ========================
-- MODEL REGISTRY
-- ========================
-- The incremental learner updates itself on every upload, which means "the
-- model" is a moving target. Without a record of which version produced a score
-- there is no way to tell whether a number moved because the city changed or
-- because the model did — and no way to roll back a bad update.
CREATE TABLE ml_model_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_name VARCHAR(100) NOT NULL,
    version INTEGER NOT NULL,
    algorithm VARCHAR(100) NOT NULL,
    -- Rows seen in this update, and cumulatively across all updates.
    samples_in_batch INTEGER NOT NULL DEFAULT 0,
    samples_total INTEGER NOT NULL DEFAULT 0,
    -- Held-out metrics for this version. A version that scores worse than its
    -- predecessor is recorded but not promoted, so regressions stay visible.
    mae NUMERIC(8,4),
    rmse NUMERIC(8,4),
    r2 NUMERIC(8,4),
    -- FALSE when the evaluation gate rejected it.
    is_promoted BOOLEAN NOT NULL DEFAULT FALSE,
    rejected_reason TEXT,
    -- Feature order, so a stored model is never fed columns in the wrong order.
    feature_names JSONB,
    artifact_path TEXT,
    trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Named for this table specifically: migration 000005 already took
    -- uq_model_version for ml_models, and constraint names are schema-global.
    CONSTRAINT uq_ml_model_versions_name_version UNIQUE (model_name, version)
);

CREATE INDEX idx_ml_model_versions_current
    ON ml_model_versions(model_name, version DESC)
    WHERE is_promoted = TRUE;

COMMENT ON TABLE ml_model_versions IS
    'Audit trail for the incremental risk learner. One row per update attempt, promoted or not.';

-- ========================
-- UPLOAD LEDGER
-- ========================
-- "Learns on every new data upload" needs a definition of an upload. This is it:
-- one row per ingested batch, so a model version can be traced back to the data
-- that moved it, and a bad file can be identified after the fact.
CREATE TABLE data_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_name VARCHAR(200) NOT NULL,
    data_source_id UUID REFERENCES data_sources(id),
    rows_received INTEGER NOT NULL DEFAULT 0,
    rows_accepted INTEGER NOT NULL DEFAULT 0,
    rows_rejected INTEGER NOT NULL DEFAULT 0,
    -- Rejections are kept as counts by reason, not as the offending rows, which
    -- could contain unvetted personal data.
    rejection_summary JSONB,
    -- Set once the learner has consumed this batch, so a crash between ingest
    -- and training is recoverable rather than silently skipping data.
    trained_model_version_id UUID REFERENCES ml_model_versions(id),
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_data_uploads_untrained
    ON data_uploads(ingested_at)
    WHERE trained_model_version_id IS NULL;

COMMENT ON TABLE data_uploads IS
    'One row per ingested batch. idx_data_uploads_untrained is the work queue the incremental learner drains.';
