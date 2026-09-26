-- Rollback: 000004_analytics_entities
DROP TABLE IF EXISTS monthly_reports;
DROP TABLE IF EXISTS safety_programs;
DROP TABLE IF EXISTS demographic_data;
DROP TABLE IF EXISTS risk_scores;

DROP TYPE IF EXISTS implementing_body;
DROP TYPE IF EXISTS program_status;
DROP TYPE IF EXISTS program_type;
DROP TYPE IF EXISTS risk_level;
