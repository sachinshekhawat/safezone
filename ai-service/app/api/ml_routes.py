"""ML prediction API endpoints."""

from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    RiskPredictionRequest,
    RiskPredictionResponse,
    TrendForecastRequest,
    TrendForecastResponse,
    AnomalyDetectionRequest,
    AnomalyDetectionResponse,
)
from app.models.risk_predictor import RiskPredictor
from app.models.trend_forecaster import TrendForecaster
from app.models.anomaly_detector import AnomalyDetector

router = APIRouter()

risk_predictor = RiskPredictor()
trend_forecaster = TrendForecaster()
anomaly_detector = AnomalyDetector()


@router.post("/predict-risk", response_model=RiskPredictionResponse)
async def predict_risk(request: RiskPredictionRequest):
    """Predict risk score for a zone based on its features."""
    try:
        result = risk_predictor.predict(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@router.post("/forecast-trend", response_model=TrendForecastResponse)
async def forecast_trend(request: TrendForecastRequest):
    """Forecast incident trend for a zone."""
    try:
        result = trend_forecaster.forecast(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forecast failed: {str(e)}")


@router.post("/detect-anomalies", response_model=AnomalyDetectionResponse)
async def detect_anomalies(request: AnomalyDetectionRequest):
    """Detect anomalies in zone incident data."""
    try:
        result = anomaly_detector.detect(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")


@router.get("/model-status")
async def model_status():
    """Get status of all ML models."""
    return {
        "risk_predictor": {
            "loaded": risk_predictor.is_loaded,
            "version": risk_predictor.version,
        },
        "trend_forecaster": {
            "loaded": trend_forecaster.is_loaded,
            "version": trend_forecaster.version,
        },
        "anomaly_detector": {
            "loaded": anomaly_detector.is_loaded,
            "version": anomaly_detector.version,
        },
    }
