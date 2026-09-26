-- Rollback: 000012_gender_aware_risk

DROP INDEX IF EXISTS idx_data_uploads_untrained;
DROP TABLE IF EXISTS data_uploads;

DROP INDEX IF EXISTS idx_ml_model_versions_current;
DROP TABLE IF EXISTS ml_model_versions;

ALTER TABLE risk_scores DROP COLUMN IF EXISTS profile_scores;

DROP INDEX IF EXISTS idx_incidents_zone_gender_time;
DROP INDEX IF EXISTS idx_incidents_victim_gender;

ALTER TABLE incidents DROP COLUMN IF EXISTS victim_gender;

DROP TYPE IF EXISTS victim_gender;
