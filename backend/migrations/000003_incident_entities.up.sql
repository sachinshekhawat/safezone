-- Migration: 000003_incident_entities
-- Description: Incident tracking tables — anonymized crime records

-- ========================
-- ENUM TYPES
-- ========================
CREATE TYPE victim_age_range AS ENUM ('0-12', '13-17', '18-25', '26-35', '36-50', '50+');
CREATE TYPE perpetrator_type AS ENUM ('outsider', 'local', 'known', 'unknown');
CREATE TYPE perpetrator_relation AS ENUM ('stranger', 'acquaintance', 'relative', 'authority', 'partner', 'unknown');
CREATE TYPE incident_type AS ENUM ('assault', 'harassment', 'stalking', 'kidnapping', 'domestic_violence', 'other');
CREATE TYPE time_of_day AS ENUM ('dawn', 'morning', 'afternoon', 'evening', 'night', 'late_night');
CREATE TYPE case_status AS ENUM ('open', 'under_investigation', 'chargesheeted', 'convicted', 'acquitted', 'closed');
CREATE TYPE incident_factor_type AS ENUM ('poor_lighting', 'isolation', 'alcohol', 'drugs', 'festival', 'public_transport', 'workplace', 'online', 'other');

-- ========================
-- INCIDENTS (fully anonymized)
-- ========================
CREATE TABLE incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
    data_source_id UUID REFERENCES data_sources(id),

    -- Victim info (anonymized — age bracket only)
    victim_age_range victim_age_range NOT NULL,
    victim_count INTEGER NOT NULL DEFAULT 1,

    -- Perpetrator info (type only — no names)
    perpetrator_type perpetrator_type NOT NULL DEFAULT 'unknown',
    perpetrator_relation perpetrator_relation NOT NULL DEFAULT 'unknown',
    perpetrator_count INTEGER NOT NULL DEFAULT 1,

    -- Incident details
    incident_type incident_type NOT NULL,
    time_of_day time_of_day,

    -- Date stored as month-year only (privacy)
    incident_month SMALLINT NOT NULL CHECK (incident_month BETWEEN 1 AND 12),
    incident_year SMALLINT NOT NULL CHECK (incident_year BETWEEN 2000 AND 2100),

    -- Legal status
    is_fir_filed BOOLEAN NOT NULL DEFAULT FALSE,
    case_status case_status NOT NULL DEFAULT 'open',

    -- Data quality
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verification_source VARCHAR(200),
    confidence_score NUMERIC(3,2) DEFAULT 1.0 CHECK (confidence_score BETWEEN 0 AND 1),

    -- Metadata
    notes TEXT, -- anonymized observations only
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

-- Performance indexes
CREATE INDEX idx_incidents_zone ON incidents(zone_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_incidents_year_month ON incidents(incident_year, incident_month) WHERE deleted_at IS NULL;
CREATE INDEX idx_incidents_type ON incidents(incident_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_incidents_age ON incidents(victim_age_range) WHERE deleted_at IS NULL;
CREATE INDEX idx_incidents_perp_type ON incidents(perpetrator_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_incidents_verified ON incidents(is_verified) WHERE deleted_at IS NULL;
CREATE INDEX idx_incidents_case_status ON incidents(case_status) WHERE deleted_at IS NULL;

-- Composite index for common analytics queries
CREATE INDEX idx_incidents_zone_year_month ON incidents(zone_id, incident_year, incident_month) 
    WHERE deleted_at IS NULL;

-- ========================
-- INCIDENT FACTORS
-- ========================
CREATE TABLE incident_factors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    factor_type incident_factor_type NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_incident_factors_incident ON incident_factors(incident_id);
CREATE INDEX idx_incident_factors_type ON incident_factors(factor_type);
