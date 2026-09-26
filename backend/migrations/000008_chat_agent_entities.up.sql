-- Migration: 000008_chat_agent_entities
-- Description: Chatbot sessions, messages, and AI agent task tracking

-- ========================
-- ENUM TYPES
-- ========================
CREATE TYPE session_type AS ENUM ('sos_crisis', 'safety_advisor', 'general');
CREATE TYPE agent_type AS ENUM ('crisis', 'advisor', 'report_gen', 'patrol_opt', 'data_analyst');
CREATE TYPE chat_role AS ENUM ('user', 'assistant', 'system', 'tool');
CREATE TYPE session_status AS ENUM ('active', 'ended', 'escalated', 'timeout');
CREATE TYPE agent_task_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE agent_trigger_type AS ENUM ('scheduled', 'manual', 'event', 'api');

-- ========================
-- CHATBOT SESSIONS
-- ========================
CREATE TABLE chatbot_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sos_request_id UUID REFERENCES sos_requests(id), -- nullable: not all chats are SOS
    user_id UUID REFERENCES users(id),                -- nullable: anonymous allowed

    session_type session_type NOT NULL,
    agent_type agent_type NOT NULL,
    language VARCHAR(5) NOT NULL DEFAULT 'en',        -- 'en', 'hi'

    status session_status NOT NULL DEFAULT 'active',
    message_count INTEGER NOT NULL DEFAULT 0,

    -- Context passed to the agent
    context_data JSONB,  -- {"zone_id": "...", "risk_level": "high", ...}

    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ
);

CREATE INDEX idx_chatbot_sessions_sos ON chatbot_sessions(sos_request_id) WHERE sos_request_id IS NOT NULL;
CREATE INDEX idx_chatbot_sessions_user ON chatbot_sessions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_chatbot_sessions_active ON chatbot_sessions(id) WHERE status = 'active';
CREATE INDEX idx_chatbot_sessions_type ON chatbot_sessions(session_type);

-- ========================
-- CHAT MESSAGES
-- ========================
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES chatbot_sessions(id) ON DELETE CASCADE,
    role chat_role NOT NULL,
    content TEXT NOT NULL,

    -- If the agent used tools
    tool_calls JSONB,     -- [{"tool": "send_police_alert", "args": {...}, "result": {...}}, ...]
    tool_name VARCHAR(100),

    -- Token tracking (for rate limiting)
    input_tokens INTEGER,
    output_tokens INTEGER,

    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, created_at ASC);
CREATE INDEX idx_chat_messages_role ON chat_messages(session_id, role);

-- ========================
-- AGENT TASKS (background AI tasks)
-- ========================
CREATE TABLE agent_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_type agent_type NOT NULL,
    trigger_type agent_trigger_type NOT NULL,
    triggered_by UUID REFERENCES users(id), -- null = system triggered

    status agent_task_status NOT NULL DEFAULT 'pending',

    -- Input/Output
    input_params JSONB,
    output_result JSONB,
    output_file_path VARCHAR(500),  -- for report PDFs

    -- Execution tracking
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_seconds NUMERIC(10,2),
    error_message TEXT,

    -- Retry logic
    retry_count SMALLINT NOT NULL DEFAULT 0,
    max_retries SMALLINT NOT NULL DEFAULT 3,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_tasks_type ON agent_tasks(agent_type);
CREATE INDEX idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX idx_agent_tasks_pending ON agent_tasks(id) WHERE status = 'pending';
CREATE INDEX idx_agent_tasks_created ON agent_tasks(created_at DESC);

-- ========================
-- SCHEDULED PURGE JOB HELPER VIEW
-- ========================
-- View: Records eligible for auto-purge (SOS data after 72h, no FIR)
CREATE VIEW v_sos_purgeable AS
SELECT sr.id AS sos_request_id, sr.auto_purge_at, sr.status
FROM sos_requests sr
WHERE sr.status = 'resolved'
  AND sr.auto_purge_at IS NOT NULL
  AND sr.auto_purge_at <= NOW();

-- View: Records eligible for hard delete (soft-deleted > 6 months ago)
CREATE VIEW v_hard_deleteable AS
SELECT 'cities' AS entity, id, deleted_at FROM cities WHERE is_deleted = TRUE AND deleted_at < NOW() - INTERVAL '6 months'
UNION ALL
SELECT 'zones', id, deleted_at FROM zones WHERE is_deleted = TRUE AND deleted_at < NOW() - INTERVAL '6 months'
UNION ALL
SELECT 'incidents', id, deleted_at FROM incidents WHERE is_deleted = TRUE AND deleted_at < NOW() - INTERVAL '6 months'
UNION ALL
SELECT 'users', id, deleted_at FROM users WHERE is_deleted = TRUE AND deleted_at < NOW() - INTERVAL '6 months'
UNION ALL
SELECT 'demographic_data', id, deleted_at FROM demographic_data WHERE is_deleted = TRUE AND deleted_at < NOW() - INTERVAL '6 months'
UNION ALL
SELECT 'safety_programs', id, deleted_at FROM safety_programs WHERE is_deleted = TRUE AND deleted_at < NOW() - INTERVAL '6 months';

-- ========================
-- UPDATED_AT TRIGGER FUNCTION
-- ========================
CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply auto-update trigger to all tables with updated_at
CREATE TRIGGER trg_cities_updated_at BEFORE UPDATE ON cities FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_zones_updated_at BEFORE UPDATE ON zones FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_incidents_updated_at BEFORE UPDATE ON incidents FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_demographic_data_updated_at BEFORE UPDATE ON demographic_data FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_safety_programs_updated_at BEFORE UPDATE ON safety_programs FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
CREATE TRIGGER trg_emergency_contacts_updated_at BEFORE UPDATE ON emergency_contacts FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
