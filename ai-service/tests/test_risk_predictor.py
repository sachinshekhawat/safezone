"""Tests for the risk predictor's heuristic path and feature contract."""

from __future__ import annotations

import pytest

from app.models.risk_predictor import RiskPredictor
from app.models.schemas import RiskPredictionRequest

VALID_LEVELS = {"critical", "high", "moderate", "low", "very_low"}


@pytest.fixture
def predictor() -> RiskPredictor:
    return RiskPredictor()


def test_score_to_level_boundaries():
    cases = [
        (100, "critical"),
        (80, "critical"),
        (79.99, "high"),
        (60, "high"),
        (59.99, "moderate"),
        (40, "moderate"),
        (39.99, "low"),
        (20, "low"),
        (19.99, "very_low"),
        (0, "very_low"),
    ]
    for score, expected in cases:
        assert RiskPredictor._score_to_level(score) == expected, f"score={score}"


def test_feature_vector_matches_declared_feature_names(predictor, zone_id):
    """_extract_features must emit exactly one column per declared feature."""
    request = RiskPredictionRequest(zone_id=zone_id)
    features = predictor._extract_features(request)

    assert features.shape == (1, len(RiskPredictor.FEATURE_NAMES))


def test_feature_vector_positions_are_stable(predictor, zone_id):
    """Each value must land in the slot its name implies."""
    request = RiskPredictionRequest(
        zone_id=zone_id,
        incident_count_1m=1,
        incident_count_3m=2,
        incident_count_6m=3,
        incident_count_12m=4,
        population_density=5.0,
        literacy_rate=6.0,
        female_literacy_rate=7.0,
        unemployment_rate=8.0,
        police_per_1000=9.0,
        streetlights_per_km=10.0,
        cctv_count=11,
        public_transport_routes=12,
        active_safety_programs=13,
        zone_type="commercial",
        month=7,
    )
    row = predictor._extract_features(request)[0]
    index = {name: i for i, name in enumerate(RiskPredictor.FEATURE_NAMES)}

    assert row[index["incident_count_1m"]] == 1
    assert row[index["incident_count_12m"]] == 4
    assert row[index["population_density"]] == 5.0
    assert row[index["cctv_count"]] == 11
    assert row[index["active_safety_programs"]] == 13
    assert row[index["zone_type_encoded"]] == RiskPredictor.ZONE_TYPE_MAP["commercial"]
    assert row[index["month"]] == 7


def test_unknown_zone_type_falls_back_to_mixed(predictor, zone_id):
    request = RiskPredictionRequest(zone_id=zone_id, zone_type="atlantis")
    row = predictor._extract_features(request)[0]
    index = RiskPredictor.FEATURE_NAMES.index("zone_type_encoded")

    assert row[index] == RiskPredictor.ZONE_TYPE_MAP["mixed"]


def test_heuristic_score_always_within_bounds(predictor, zone_id):
    """The heuristic must stay in 0-100 even for extreme inputs."""
    extremes = [
        RiskPredictionRequest(zone_id=zone_id),
        RiskPredictionRequest(
            zone_id=zone_id,
            incident_count_1m=999,
            incident_count_3m=999,
            incident_count_6m=999,
            incident_count_12m=999,
        ),
        RiskPredictionRequest(
            zone_id=zone_id,
            literacy_rate=100,
            police_per_1000=50,
            streetlights_per_km=500,
            cctv_count=10_000,
            active_safety_programs=100,
        ),
    ]
    for request in extremes:
        score = predictor._heuristic_score(request)
        assert 0 <= score <= 100, f"score {score} out of bounds"


def test_predict_returns_consistent_level_and_score(predictor, zone_id):
    request = RiskPredictionRequest(
        zone_id=zone_id,
        incident_count_1m=6,
        incident_count_12m=40,
        literacy_rate=55,
        police_per_1000=0.2,
        streetlights_per_km=2,
    )
    response = predictor.predict(request)

    assert response.zone_id == zone_id
    assert 0 <= response.predicted_risk_score <= 100
    assert response.risk_level in VALID_LEVELS
    assert response.risk_level == RiskPredictor._score_to_level(response.predicted_risk_score)
    assert 0 <= response.confidence <= 1


def test_more_incidents_never_lowers_risk(predictor, zone_id):
    """Monotonicity sanity check on the heuristic."""
    low = predictor._heuristic_score(
        RiskPredictionRequest(zone_id=zone_id, incident_count_1m=0, incident_count_12m=0)
    )
    high = predictor._heuristic_score(
        RiskPredictionRequest(zone_id=zone_id, incident_count_1m=5, incident_count_12m=30)
    )
    assert high >= low


def test_high_risk_produces_actionable_recommendations(predictor, zone_id):
    request = RiskPredictionRequest(
        zone_id=zone_id,
        incident_count_1m=10,
        incident_count_12m=80,
        literacy_rate=40,
        police_per_1000=0.1,
        streetlights_per_km=1,
    )
    response = predictor.predict(request)

    assert response.recommendations, "expected at least one recommendation"
    assert all(isinstance(r, str) and r for r in response.recommendations)


def test_contributing_factors_capped_at_five(predictor, zone_id):
    request = RiskPredictionRequest(
        zone_id=zone_id,
        incident_count_1m=10,
        literacy_rate=30,
        police_per_1000=0.1,
        streetlights_per_km=1,
        cctv_count=0,
    )
    response = predictor.predict(request)

    assert len(response.contributing_factors) <= 5
