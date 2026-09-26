-- Rollback: 000005_ml_entities
DROP TABLE IF EXISTS predictions;
DROP TABLE IF EXISTS ml_models;

DROP TYPE IF EXISTS trend_direction;
DROP TYPE IF EXISTS model_status;
DROP TYPE IF EXISTS model_algorithm;
DROP TYPE IF EXISTS model_type;
