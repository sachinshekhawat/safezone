"""Pydantic schemas for API requests and responses."""

from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# =========================
# ML Prediction Schemas
# =========================


class RiskPredictionRequest(BaseModel):
    """Request for risk score prediction."""

    zone_id: UUID
    # Features
    incident_count_1m: int = Field(default=0, description="Incidents in last 1 month")
    incident_count_3m: int = Field(default=0, description="Incidents in last 3 months")
    incident_count_6m: int = Field(default=0, description="Incidents in last 6 months")
    incident_count_12m: int = Field(default=0, description="Incidents in last 12 months")
    population_density: float = Field(default=0.0, description="Population per sq km")
    literacy_rate: float = Field(default=0.0, description="Literacy rate %")
    female_literacy_rate: float = Field(default=0.0, description="Female literacy rate %")
    unemployment_rate: float = Field(default=0.0, description="Unemployment rate %")
    police_per_1000: float = Field(default=0.0, description="Police per 1000 people")
    streetlights_per_km: float = Field(default=0.0, description="Streetlights per km")
    cctv_count: int = Field(default=0, description="CCTV cameras in zone")
    public_transport_routes: int = Field(default=0, description="Public transport routes")
    active_safety_programs: int = Field(default=0, description="Active safety programs")
    zone_type: str = Field(default="mixed", description="Zone type")
    month: int = Field(default=1, description="Month (1-12)")


class RiskPredictionResponse(BaseModel):
    """Response from risk score prediction."""

    zone_id: UUID
    predicted_risk_score: float = Field(description="Risk score 0-100")
    risk_level: str = Field(description="critical/high/moderate/low/very_low")
    confidence: float = Field(description="Prediction confidence 0-1")
    contributing_factors: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Top contributing factors",
    )
    recommendations: list[str] = Field(
        default_factory=list,
        description="Safety recommendations",
    )


class TrendForecastRequest(BaseModel):
    """Request for trend forecasting."""

    zone_id: UUID
    historical_data: list[dict[str, Any]] = Field(
        description="Monthly incident counts: [{'month': 1, 'year': 2024, 'count': 5}, ...]"
    )
    forecast_months: int = Field(default=6, description="Months to forecast")


class TrendForecastResponse(BaseModel):
    """Response from trend forecasting."""

    zone_id: UUID
    trend_direction: str = Field(description="increasing/decreasing/stable")
    forecasted_values: list[dict[str, Any]] = Field(
        description="Forecasted monthly values"
    )
    confidence_interval: dict[str, Any] = Field(
        default_factory=dict,
        description="Upper and lower bounds",
    )


class AnomalyDetectionRequest(BaseModel):
    """Request for anomaly detection."""

    zone_id: UUID
    recent_data: list[dict[str, Any]] = Field(
        description="Recent data points to check"
    )


class AnomalyDetectionResponse(BaseModel):
    """Response from anomaly detection."""

    zone_id: UUID
    anomalies_detected: bool
    anomaly_score: float
    anomalies: list[dict[str, Any]] = Field(default_factory=list)
    message: str


# =========================
# Chat / Agent Schemas
# =========================


class ChatRequest(BaseModel):
    """Request for agent chat."""

    message: str = Field(description="User message")
    agent_type: str = Field(description="crisis/advisor/report_gen/patrol_opt/data_analyst")
    session_id: Optional[str] = Field(default=None, description="Existing session ID")
    language: Optional[str] = Field(default="en", description="en or hi")
    context: Optional[dict[str, Any]] = Field(
        default=None,
        description="Context data (location, risk level, etc.)",
    )


class ChatResponse(BaseModel):
    """Response from agent chat."""

    session_id: str
    message: str
    tools_used: list[str] = Field(default_factory=list)
    metadata: Optional[dict[str, Any]] = None


class AgentTaskRequest(BaseModel):
    """Request for triggering an agent task."""

    params: dict[str, Any] = Field(default_factory=dict)


class AgentTaskResponse(BaseModel):
    """Response from an agent task."""

    task_id: str
    status: str
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None
