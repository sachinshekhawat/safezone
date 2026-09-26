-- Migration: 000005_ml_entities
-- Description: ML model tracking and predictions

-- ========================
-- ENUM TYPES
-- ========================
CREATE TYPE model_type AS ENUM ('risk_prediction', 'trend_forecast', 'anomaly_detection');
CREATE TYPE model_algorithm AS ENUM ('random_forest', 'xgboost', 'lightgbm', 'prophet', 'arima', 'lstm', 'isolation_forest');
CREATE TYPE model_status AS ENUM ('active', 'archived', 'training', 'failed', 'evaluating');
CREATE TYPE trend_direction AS ENUM ('increasing', 'decreasing', 'stable');

-- ========================
-- ML MODELS (model registry)
-- ========================
CREATE TABLE ml_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_name VARCHAR(200) NOT NULL,
    model_version VARCHAR(50) NOT NULL,
    model_type model_type NOT NULL,
    algorithm model_algorithm NOT NULL,

    -- Performance metrics
    accuracy NUMERIC(5,4),
    precision_score NUMERIC(5,4),
    recall NUMERIC(5,4),
    f1_score NUMERIC(5,4),
    mae NUMERIC(10,4),         -- mean absolute error (for regression)
    rmse NUMERIC(10,4),        -- root mean squared error

    -- Feature info
    feature_importances JSONB,  -- {"population_density": 0.23, "literacy_rate": 0.18, ...}
    feature_list JSONB,         -- ["population_density", "literacy_rate", ...]
    hyperparameters JSONB,

    -- Artifact
    model_artifact_path VARCHAR(500),
    trained_on_data_until DATE,
    training_data_size INTEGER,

    -- Status
    status model_status NOT NULL DEFAULT 'training',

    trained_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_model_version UNIQUE (model_name, model_version)
);

CREATE INDEX idx_ml_models_type ON ml_models(model_type);
CREATE INDEX idx_ml_models_status ON ml_models(status);
CREATE INDEX idx_ml_models_active ON ml_models(id) WHERE status = 'active';

-- ========================
-- PREDICTIONS
-- ========================
CREATE TABLE predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
    model_id UUID NOT NULL REFERENCES ml_models(id) ON DELETE RESTRICT,

    -- Prediction output
    predicted_risk_score NUMERIC(5,2) CHECK (predicted_risk_score BETWEEN 0 AND 100),
    predicted_trend trend_direction,
    predicted_incident_count INTEGER,
    confidence NUMERIC(5,4) CHECK (confidence BETWEEN 0 AND 1),

    -- Prediction period
    prediction_month SMALLINT NOT NULL CHECK (prediction_month BETWEEN 1 AND 12),
    prediction_year SMALLINT NOT NULL,

    -- Explanation
    contributing_factors JSONB,  -- [{"factor": "literacy_rate_drop", "impact": -5.2}, ...]
    explanation_text TEXT,

    -- Validation (filled in after actual data arrives)
    actual_risk_score NUMERIC(5,2),
    actual_incident_count INTEGER,
    prediction_error NUMERIC(7,4),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_prediction_zone_period UNIQUE (zone_id, model_id, prediction_year, prediction_month)
);

CREATE INDEX idx_predictions_zone ON predictions(zone_id);
CREATE INDEX idx_predictions_model ON predictions(model_id);
CREATE INDEX idx_predictions_period ON predictions(prediction_year, prediction_month);
