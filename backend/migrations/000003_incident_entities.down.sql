-- Rollback: 000003_incident_entities
DROP TABLE IF EXISTS incident_factors;
DROP TABLE IF EXISTS incidents;

DROP TYPE IF EXISTS incident_factor_type;
DROP TYPE IF EXISTS case_status;
DROP TYPE IF EXISTS time_of_day;
DROP TYPE IF EXISTS incident_type;
DROP TYPE IF EXISTS perpetrator_relation;
DROP TYPE IF EXISTS perpetrator_type;
DROP TYPE IF EXISTS victim_age_range;
