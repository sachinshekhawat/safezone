"""Tests for training data loaders.

The most important property here is that training-time feature construction
matches inference-time feature construction. If these drift, the model silently
predicts nonsense.
"""

from __future__ import annotations

from app.data.loaders import (
    FEATURE_NAMES,
    TARGET_NAME,
    ZONE_TYPE_MAP,
    build_xy,
    generate_synthetic_dataset,
    row_to_features,
)
from app.models.risk_predictor import RiskPredictor
from app.models.schemas import RiskPredictionRequest


def test_feature_contract_matches_risk_predictor():
    """Loader feature order must be identical to the inference feature order."""
    assert FEATURE_NAMES == list(RiskPredictor.FEATURE_NAMES)
    assert ZONE_TYPE_MAP == dict(RiskPredictor.ZONE_TYPE_MAP)


def test_row_to_features_matches_predictor_extraction(zone_id):
    """The same logical zone must produce an identical vector either way."""
    row = {
        "incident_count_1m": 1,
        "incident_count_3m": 2,
        "incident_count_6m": 3,
        "incident_count_12m": 4,
        "population_density": 5.0,
        "literacy_rate": 6.0,
        "female_literacy_rate": 7.0,
        "unemployment_rate": 8.0,
        "police_per_1000": 9.0,
        "streetlights_per_km": 10.0,
        "cctv_count": 11,
        "public_transport_routes": 12,
        "active_safety_programs": 13,
        "zone_type": "commercial",
        "month": 7,
    }
    from_loader = row_to_features(row)
    from_predictor = RiskPredictor()._extract_features(
        RiskPredictionRequest(zone_id=zone_id, **row)
    )[0]

    assert len(from_loader) == len(from_predictor)
    assert [float(v) for v in from_loader] == [float(v) for v in from_predictor]


def test_row_to_features_length():
    assert len(row_to_features({})) == len(FEATURE_NAMES)


def test_row_to_features_handles_missing_and_null_values():
    vector = row_to_features({"literacy_rate": None, "zone_type": None})
    assert len(vector) == len(FEATURE_NAMES)
    assert all(isinstance(v, float) for v in vector)


def test_synthetic_dataset_is_deterministic():
    a = generate_synthetic_dataset(n_samples=50, seed=7)
    b = generate_synthetic_dataset(n_samples=50, seed=7)
    assert a == b

    c = generate_synthetic_dataset(n_samples=50, seed=8)
    assert a != c


def test_synthetic_dataset_size_and_labelling():
    rows = generate_synthetic_dataset(n_samples=120, seed=1)
    assert len(rows) == 120
    # Synthetic rows must be self-identifying so they cannot be mistaken for real data.
    assert all(row["_synthetic"] is True for row in rows)


def test_synthetic_targets_within_database_constraint():
    """overall_score has a CHECK (0-100) constraint in PostgreSQL."""
    for row in generate_synthetic_dataset(n_samples=500, seed=3):
        assert 0.0 <= row[TARGET_NAME] <= 100.0


def test_synthetic_incident_windows_are_nested():
    """Cumulative windows must satisfy 1m <= 3m <= 6m <= 12m."""
    for row in generate_synthetic_dataset(n_samples=500, seed=5):
        assert row["incident_count_1m"] <= row["incident_count_3m"]
        assert row["incident_count_3m"] <= row["incident_count_6m"]
        assert row["incident_count_6m"] <= row["incident_count_12m"]


def test_synthetic_zone_types_are_all_encodable():
    for row in generate_synthetic_dataset(n_samples=300, seed=11):
        assert row["zone_type"] in ZONE_TYPE_MAP


def test_synthetic_months_valid():
    for row in generate_synthetic_dataset(n_samples=300, seed=13):
        assert 1 <= row["month"] <= 12


def test_build_xy_shapes():
    rows = generate_synthetic_dataset(n_samples=40, seed=2)
    x, y = build_xy(rows)

    assert len(x) == len(y) == 40
    assert all(len(vector) == len(FEATURE_NAMES) for vector in x)


def test_build_xy_skips_rows_without_target():
    rows = generate_synthetic_dataset(n_samples=10, seed=2)
    rows.append({"zone_type": "mixed", "month": 1})  # no target

    x, y = build_xy(rows)
    assert len(x) == len(y) == 10


def test_synthetic_target_responds_to_signal():
    """Risk should trend higher for incident-heavy, under-policed rows."""
    rows = generate_synthetic_dataset(n_samples=2000, seed=21)

    heavy = [r[TARGET_NAME] for r in rows if r["incident_count_12m"] > 45]
    light = [r[TARGET_NAME] for r in rows if r["incident_count_12m"] < 10]

    assert heavy and light
    assert sum(heavy) / len(heavy) > sum(light) / len(light)
