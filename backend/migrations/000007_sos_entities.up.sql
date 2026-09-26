-- Migration: 000007_sos_entities
-- Description: SOS emergency system — requests, live location tracking, emergency contacts

-- ========================
-- ENUM TYPES
-- ========================
CREATE TYPE sos_status AS ENUM ('active', 'acknowledged', 'resolved', 'false_alarm', 'escalated', 'expired');
CREATE TYPE sos_trigger_method AS ENUM ('button', 'silent', 'voice', 'shake', 'widget');
CREATE TYPE contact_relation AS ENUM ('parent', 'friend', 'spouse', 'sibling', 'colleague', 'other');

-- ========================
-- SOS REQUESTS
-- ========================
CREATE TABLE sos_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),       -- nullable: anonymous SOS allowed
    device_id VARCHAR(200),                   -- for anonymous identification

    -- Location at trigger time
    zone_id UUID REFERENCES zones(id),
    trigger_lat DOUBLE PRECISION NOT NULL,
    trigger_lng DOUBLE PRECISION NOT NULL,

    -- Status
    status sos_status NOT NULL DEFAULT 'active',
    trigger_method sos_trigger_method NOT NULL DEFAULT 'button',

    -- Nearest police station (auto-resolved)
    nearest_station_id UUID REFERENCES police_stations(id),
    station_distance_km NUMERIC(6,2),

    -- Response tracking
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES users(id), -- police officer
    response_time_seconds INTEGER,             -- time from trigger to acknowledgment
    resolution_notes TEXT,

    -- Evidence (encrypted)
    audio_recorded BOOLEAN NOT NULL DEFAULT FALSE,
    audio_file_path VARCHAR(500),              -- encrypted storage path

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    auto_purge_at TIMESTAMPTZ,                 -- 72h after resolution

    -- Escalation tracking
    escalation_level SMALLINT NOT NULL DEFAULT 0, -- 0=station, 1=district, 2=state
    escalated_at TIMESTAMPTZ
);

CREATE INDEX idx_sos_active ON sos_requests(id) WHERE status = 'active';
CREATE INDEX idx_sos_zone ON sos_requests(zone_id);
CREATE INDEX idx_sos_station ON sos_requests(nearest_station_id);
CREATE INDEX idx_sos_created ON sos_requests(created_at DESC);
CREATE INDEX idx_sos_purge ON sos_requests(auto_purge_at) WHERE auto_purge_at IS NOT NULL AND status = 'resolved';
CREATE INDEX idx_sos_location ON sos_requests USING GIST(
    ST_SetSRID(ST_MakePoint(trigger_lng, trigger_lat), 4326)
);

-- ========================
-- LIVE LOCATION (streaming GPS during SOS)
-- ========================
CREATE TABLE live_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sos_request_id UUID NOT NULL REFERENCES sos_requests(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy_meters NUMERIC(8,2),
    speed_mps NUMERIC(8,2),
    heading NUMERIC(5,2),                -- compass bearing 0-360
    altitude_meters NUMERIC(10,2),
    battery_percent SMALLINT,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- This table will have high write throughput during active SOS
CREATE INDEX idx_live_locations_sos ON live_locations(sos_request_id, captured_at DESC);
CREATE INDEX idx_live_locations_geo ON live_locations USING GIST(
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
);

-- ========================
-- EMERGENCY CONTACTS
-- ========================
CREATE TABLE emergency_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,     -- stored encrypted in application layer
    relation contact_relation NOT NULL DEFAULT 'other',
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    notify_on_sos BOOLEAN NOT NULL DEFAULT TRUE,
    last_notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_emergency_contacts_user ON emergency_contacts(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_emergency_contacts_primary ON emergency_contacts(user_id) WHERE is_primary = TRUE AND deleted_at IS NULL;
