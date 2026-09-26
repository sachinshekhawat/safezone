-- Migration: 000004_analytics_entities
-- Description: Risk scoring, demographics, safety programs, monthly reports

-- ========================
-- ENUM TYPES
-- ========================
CREATE TYPE risk_level AS ENUM ('critical', 'high', 'moderate', 'low', 'very_low');
CREATE TYPE program_type AS ENUM ('awareness', 'patrol', 'infrastructure', 'helpline', 'ngo', 'training', 'legal_aid');
CREATE TYPE program_status AS ENUM ('active', 'completed', 'planned', 'suspended');
CREATE TYPE implementing_body AS ENUM ('central_govt', 'state_govt', 'police', 'ngo', 'community', 'private');

-- ========================
-- RISK SCORES
-- ========================
CREATE TABLE risk_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,

    -- Overall risk
    overall_score NUMERIC(5,2) NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
    risk_level risk_level NOT NULL,

    -- Component scores (0-100 each)
    incident_frequency_score NUMERIC(5,2) DEFAULT 0,
    recency_score NUMERIC(5,2) DEFAULT 0,           -- higher if recent incidents
    demographic_risk_score NUMERIC(5,2) DEFAULT 0,   -- based on literacy, population density
    infrastructure_score NUMERIC(5,2) DEFAULT 0,     -- police density, CCTV, lighting
    trend_score NUMERIC(5,2) DEFAULT 0,              -- positive = declining risk

    -- Trend direction
    trend_direction VARCHAR(20) CHECK (trend_direction IN ('increasing', 'decreasing', 'stable')),

    -- Time period this score applies to
    calculated_for_month SMALLINT NOT NULL CHECK (calculated_for_month BETWEEN 1 AND 12),
    calculated_for_year SMALLINT NOT NULL,

    -- Detailed breakdown (JSON)
    score_breakdown JSONB,

    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One score per zone per month
    CONSTRAINT uq_risk_score_zone_period UNIQUE (zone_id, calculated_for_year, calculated_for_month)
);

CREATE INDEX idx_risk_scores_zone ON risk_scores(zone_id);
CREATE INDEX idx_risk_scores_period ON risk_scores(calculated_for_year, calculated_for_month);
CREATE INDEX idx_risk_scores_level ON risk_scores(risk_level);
CREATE INDEX idx_risk_scores_overall ON risk_scores(overall_score DESC);

-- ========================
-- DEMOGRAPHIC DATA
-- ========================
CREATE TABLE demographic_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    city_id UUID REFERENCES cities(id),
    zone_id UUID REFERENCES zones(id),

    -- Population
    total_population INTEGER,
    female_population INTEGER,
    population_density_per_sqkm NUMERIC(10,2),

    -- Education
    literacy_rate_percent NUMERIC(5,2),
    female_literacy_rate_percent NUMERIC(5,2),

    -- Economic
    unemployment_rate NUMERIC(5,2),
    avg_household_income NUMERIC(12,2),
    below_poverty_line_percent NUMERIC(5,2),

    -- Infrastructure / Safety
    police_stations_count INTEGER DEFAULT 0,
    police_per_1000 NUMERIC(6,3),
    streetlights_per_km NUMERIC(6,2),
    cctv_count INTEGER DEFAULT 0,
    public_transport_routes INTEGER DEFAULT 0,

    -- Data period
    year SMALLINT NOT NULL,
    data_source VARCHAR(200),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,

    -- Either city or zone level data (at least one must be set)
    CONSTRAINT chk_demographic_scope CHECK (city_id IS NOT NULL OR zone_id IS NOT NULL),
    CONSTRAINT uq_demographic_city_year UNIQUE (city_id, year) DEFERRABLE,
    CONSTRAINT uq_demographic_zone_year UNIQUE (zone_id, year) DEFERRABLE
);

CREATE INDEX idx_demographic_city ON demographic_data(city_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_demographic_zone ON demographic_data(zone_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_demographic_year ON demographic_data(year) WHERE deleted_at IS NULL;

-- ========================
-- SAFETY PROGRAMS
-- ========================
CREATE TABLE safety_programs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
    name VARCHAR(300) NOT NULL,
    program_type program_type NOT NULL,
    implementing_body implementing_body NOT NULL,
    start_date DATE,
    end_date DATE,
    status program_status NOT NULL DEFAULT 'planned',
    description TEXT,
    budget_lakhs NUMERIC(12,2),
    impact_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_safety_programs_zone ON safety_programs(zone_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_safety_programs_status ON safety_programs(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_safety_programs_type ON safety_programs(program_type) WHERE deleted_at IS NULL;

-- ========================
-- MONTHLY REPORTS (pre-aggregated)
-- ========================
CREATE TABLE monthly_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    city_id UUID REFERENCES cities(id),
    zone_id UUID REFERENCES zones(id),

    -- Period
    month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year SMALLINT NOT NULL,

    -- Aggregated stats
    total_incidents INTEGER NOT NULL DEFAULT 0,
    incidents_with_fir INTEGER NOT NULL DEFAULT 0,
    conviction_rate NUMERIC(5,2),
    avg_victim_age_range VARCHAR(10),
    risk_score_avg NUMERIC(5,2),

    -- Trends
    trend_vs_last_month NUMERIC(7,2), -- % change
    trend_vs_last_year NUMERIC(7,2),  -- % change

    -- Distribution breakdowns (JSON)
    age_distribution JSONB,         -- {"0-12": 5, "13-17": 12, ...}
    perpetrator_distribution JSONB, -- {"outsider": 10, "local": 8, ...}
    time_distribution JSONB,        -- {"night": 15, "evening": 8, ...}
    type_distribution JSONB,        -- {"assault": 10, "harassment": 20, ...}

    -- AI-generated narrative (from Report Generator Agent)
    narrative_summary TEXT,

    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_report_scope CHECK (city_id IS NOT NULL OR zone_id IS NOT NULL),
    CONSTRAINT uq_report_city_period UNIQUE (city_id, year, month) DEFERRABLE,
    CONSTRAINT uq_report_zone_period UNIQUE (zone_id, year, month) DEFERRABLE
);

CREATE INDEX idx_monthly_reports_city ON monthly_reports(city_id);
CREATE INDEX idx_monthly_reports_zone ON monthly_reports(zone_id);
CREATE INDEX idx_monthly_reports_period ON monthly_reports(year, month);
