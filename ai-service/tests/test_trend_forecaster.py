"""Tests for the trend forecaster."""

from __future__ import annotations

import pytest

from app.models.schemas import TrendForecastRequest
from app.models.trend_forecaster import TrendForecaster


@pytest.fixture
def forecaster() -> TrendForecaster:
    return TrendForecaster()


def _series(counts: list[int], start_month: int = 1, year: int = 2024) -> list[dict]:
    out = []
    month, yr = start_month, year
    for c in counts:
        out.append({"month": month, "year": yr, "count": c})
        month += 1
        if month > 12:
            month = 1
            yr += 1
    return out


def test_insufficient_data_returns_stable(forecaster, zone_id):
    request = TrendForecastRequest(
        zone_id=zone_id,
        historical_data=_series([1, 2]),
        forecast_months=6,
    )
    response = forecaster.forecast(request)

    assert response.trend_direction == "stable"
    assert response.forecasted_values == []


def test_detects_increasing_trend(forecaster, zone_id):
    request = TrendForecastRequest(
        zone_id=zone_id,
        historical_data=_series([1, 3, 5, 7, 9, 11]),
        forecast_months=3,
    )
    assert forecaster.forecast(request).trend_direction == "increasing"


def test_detects_decreasing_trend(forecaster, zone_id):
    request = TrendForecastRequest(
        zone_id=zone_id,
        historical_data=_series([20, 17, 14, 11, 8, 5]),
        forecast_months=3,
    )
    assert forecaster.forecast(request).trend_direction == "decreasing"


def test_detects_stable_trend(forecaster, zone_id):
    request = TrendForecastRequest(
        zone_id=zone_id,
        historical_data=_series([7, 7, 7, 7, 7, 7]),
        forecast_months=3,
    )
    response = forecaster.forecast(request)

    assert response.trend_direction == "stable"
    assert response.confidence_interval["slope"] == 0


def test_forecast_length_matches_request(forecaster, zone_id):
    for months in (1, 3, 6, 12):
        request = TrendForecastRequest(
            zone_id=zone_id,
            historical_data=_series([1, 2, 3, 4, 5, 6]),
            forecast_months=months,
        )
        assert len(forecaster.forecast(request).forecasted_values) == months


def test_forecast_never_predicts_negative_counts(forecaster, zone_id):
    """A steep decline must floor at zero, not go negative."""
    request = TrendForecastRequest(
        zone_id=zone_id,
        historical_data=_series([50, 40, 30, 20, 10, 1]),
        forecast_months=12,
    )
    response = forecaster.forecast(request)

    assert all(v["predicted_count"] >= 0 for v in response.forecasted_values)


def test_forecast_periods_are_chronological(forecaster, zone_id):
    """Forecast periods must advance in time and roll the year over correctly."""
    request = TrendForecastRequest(
        zone_id=zone_id,
        # Ends in December 2024, so the forecast must cross into 2025.
        historical_data=_series([1, 2, 3, 4, 5, 6], start_month=7, year=2024),
        forecast_months=6,
    )
    response = forecaster.forecast(request)

    ordinals = [v["year"] * 12 + v["month"] for v in response.forecasted_values]
    assert ordinals == sorted(ordinals), f"not chronological: {response.forecasted_values}"
    assert len(set(ordinals)) == len(ordinals), "duplicate forecast periods"

    for v in response.forecasted_values:
        assert 1 <= v["month"] <= 12

    # The series ends 2024-12, so the first forecast point must be 2025-01.
    assert response.forecasted_values[0]["year"] == 2025
    assert response.forecasted_values[0]["month"] == 1


def test_unsorted_input_is_handled(forecaster, zone_id):
    """Input is sorted internally, so shuffled data must give the same trend."""
    ordered = _series([1, 3, 5, 7, 9, 11])
    shuffled = [ordered[i] for i in (3, 0, 5, 1, 4, 2)]

    a = forecaster.forecast(
        TrendForecastRequest(zone_id=zone_id, historical_data=ordered, forecast_months=3)
    )
    b = forecaster.forecast(
        TrendForecastRequest(zone_id=zone_id, historical_data=shuffled, forecast_months=3)
    )
    assert a.trend_direction == b.trend_direction
