-- Migration: 000002_core_entities
-- Description: Core lookup/reference tables — cities, zones, data_sources, users, police_stations

-- ========================
-- ENUM TYPES
-- ========================
CREATE TYPE city_tier AS ENUM ('metro', 'tier1', 'tier2', 'tier3');
CREATE TYPE zone_type AS ENUM ('residential', 'commercial', 'industrial', 'rural', 'mixed', 'institutional');
CREATE TYPE user_role AS ENUM ('admin', 'police_officer', 'analyst', 'public');
CREATE TYPE station_type AS ENUM ('thana', 'chowki', 'booth', 'control_room');
CREATE TYPE source_type AS ENUM ('government', 'media', 'ngo', 'court_records');
CREATE TYPE reliability_rating AS ENUM ('high', 'medium', 'low');

-- ========================
-- CITIES
-- ========================
CREATE TABLE cities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    population INTEGER,
    literacy_rate NUMERIC(5,2),
    female_literacy_rate NUMERIC(5,2),
    tier city_tier NOT NULL DEFAULT 'tier2',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,               -- soft delete
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE, -- hard delete flag
    CONSTRAINT uq_city_name_state UNIQUE (name, state)
);

CREATE INDEX idx_cities_state ON cities(state) WHERE deleted_at IS NULL;
CREATE INDEX idx_cities_tier ON cities(tier) WHERE deleted_at IS NULL;
CREATE INDEX idx_cities_not_deleted ON cities(id) WHERE deleted_at IS NULL AND is_deleted = FALSE;

-- ========================
-- ZONES (areas within cities)
-- ========================
CREATE TABLE zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    city_id UUID NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,
    name VARCHAR(200) NOT NULL,
    zone_type zone_type NOT NULL DEFAULT 'mixed',
    boundary GEOMETRY(Polygon, 4326),      -- PostGIS polygon
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    radius_km NUMERIC(6,2),
    pin_code VARCHAR(10),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_zone_city UNIQUE (city_id, name)
);

CREATE INDEX idx_zones_city ON zones(city_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_zones_boundary ON zones USING GIST(boundary);
CREATE INDEX idx_zones_pin ON zones(pin_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_zones_location ON zones USING GIST(
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
);

-- ========================
-- DATA SOURCES
-- ========================
CREATE TABLE data_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    source_type source_type NOT NULL,
    url TEXT,
    reliability reliability_rating NOT NULL DEFAULT 'medium',
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_data_source_name UNIQUE (name)
);

-- ========================
-- USERS (admin, police, analysts)
-- ========================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(200) NOT NULL,
    role user_role NOT NULL DEFAULT 'public',
    department VARCHAR(200),
    badge_number VARCHAR(50),
    assigned_city_id UUID REFERENCES cities(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_user_email UNIQUE (email)
);

CREATE INDEX idx_users_role ON users(role) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_city ON users(assigned_city_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_active ON users(id) WHERE is_active = TRUE AND deleted_at IS NULL;

-- ========================
-- POLICE STATIONS
-- ========================
CREATE TABLE police_stations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
    name VARCHAR(200) NOT NULL,
    address TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    phone_number VARCHAR(20),
    station_type station_type NOT NULL DEFAULT 'thana',
    has_women_desk BOOLEAN NOT NULL DEFAULT FALSE,
    officers_count INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_police_stations_zone ON police_stations(zone_id) WHERE is_active = TRUE;
CREATE INDEX idx_police_stations_location ON police_stations USING GIST(
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
);
CREATE INDEX idx_police_stations_type ON police_stations(station_type) WHERE is_active = TRUE;
