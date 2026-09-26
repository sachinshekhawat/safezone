-- Rollback: 000008_chat_agent_entities

-- Drop triggers
DROP TRIGGER IF EXISTS trg_emergency_contacts_updated_at ON emergency_contacts;
DROP TRIGGER IF EXISTS trg_safety_programs_updated_at ON safety_programs;
DROP TRIGGER IF EXISTS trg_demographic_data_updated_at ON demographic_data;
DROP TRIGGER IF EXISTS trg_incidents_updated_at ON incidents;
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
DROP TRIGGER IF EXISTS trg_zones_updated_at ON zones;
DROP TRIGGER IF EXISTS trg_cities_updated_at ON cities;
DROP FUNCTION IF EXISTS fn_update_timestamp();

-- Drop views
DROP VIEW IF EXISTS v_hard_deleteable;
DROP VIEW IF EXISTS v_sos_purgeable;

-- Drop tables
DROP TABLE IF EXISTS agent_tasks;
DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS chatbot_sessions;

-- Drop types
DROP TYPE IF EXISTS agent_trigger_type;
DROP TYPE IF EXISTS agent_task_status;
DROP TYPE IF EXISTS session_status;
DROP TYPE IF EXISTS chat_role;
DROP TYPE IF EXISTS agent_type;
DROP TYPE IF EXISTS session_type;
