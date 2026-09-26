"""Tests for the anomaly detector."""

from __future__ import annotations

import pytest

from app.models.anomaly_detector import AnomalyDetector
from app.models.schemas import AnomalyDetectionRequest


@pytest.fixture
def detector() -> AnomalyDetector:
    return AnomalyDetector()


def _points(counts: list[int]) -> list[dict]:
    return [{"month": i + 1, "year": 2024, "count": c} for i, c in enumerate(counts)]


def test_insufficient_data_is_reported(detector, zone_id):
    response = detector.detect(
        AnomalyDetectionRequest(zone_id=zone_id, recent_data=_points([1, 2, 3, 4]))
    )
    assert response.anomalies_detected is False
    assert response.anomaly_score == 0.0
    assert "Insufficient data" in response.message


def test_zero_variance_reports_no_anomalies(detector, zone_id):
    response = detector.detect(
        AnomalyDetectionRequest(zone_id=zone_id, recent_data=_points([5, 5, 5, 5, 5, 5]))
    )
    assert response.anomalies_detected is False
    assert "No variance" in response.message


def test_detects_obvious_spike(detector, zone_id):
    counts = [4, 5, 4, 5, 4, 5, 4, 5, 4, 60]
    response = detector.detect(
        AnomalyDetectionRequest(zone_id=zone_id, recent_data=_points(counts))
    )

    assert response.anomalies_detected is True
    assert response.anomaly_score > 0
    assert any(a["type"] == "spike" for a in response.anomalies)


def test_normal_variation_is_not_flagged(detector, zone_id):
    counts = [10, 11, 9, 10, 12, 8, 11, 10, 9, 11]
    response = detector.detect(
        AnomalyDetectionRequest(zone_id=zone_id, recent_data=_points(counts))
    )
    assert response.anomalies_detected is False


def test_anomaly_payload_shape(detector, zone_id):
    counts = [4, 5, 4, 5, 4, 5, 4, 5, 4, 60]
    response = detector.detect(
        AnomalyDetectionRequest(zone_id=zone_id, recent_data=_points(counts))
    )

    for anomaly in response.anomalies:
        assert {"index", "data_point", "z_score", "type", "severity", "message"} <= set(anomaly)
        assert anomaly["type"] in {"spike", "drop"}
        assert anomaly["severity"] in {"high", "medium"}
        assert 0 <= anomaly["index"] < len(counts)


def test_anomaly_score_is_normalised(detector, zone_id):
    """anomaly_score is documented as 0-1."""
    counts = [1, 1, 1, 1, 1, 1, 1, 1, 1, 100000]
    response = detector.detect(
        AnomalyDetectionRequest(zone_id=zone_id, recent_data=_points(counts))
    )
    assert 0.0 <= response.anomaly_score <= 1.0
