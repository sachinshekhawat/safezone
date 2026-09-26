-- Rollback: 000007_sos_entities
DROP TABLE IF EXISTS emergency_contacts;
DROP TABLE IF EXISTS live_locations;
DROP TABLE IF EXISTS sos_requests;

DROP TYPE IF EXISTS contact_relation;
DROP TYPE IF EXISTS sos_trigger_method;
DROP TYPE IF EXISTS sos_status;
