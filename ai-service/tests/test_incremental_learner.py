"""Incremental learner tests.

The important ones are the gate tests: an online model that accepts every batch
is not learning, it is drifting wherever the last upload pushed it.
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from app.models.incremental_learner import (
    FEATURE_BOUNDS,
    FEATURE_NAMES,
    MAE_REGRESSION_TOLERANCE,
    MIN_BATCH_ROWS,
    IncrementalRiskLearner,
    featurise,
)


def make_row(seed: int, *, zone_type: str = "mixed", noise: float = 0.0) -> dict:
    """A plausible zone-month record whose target is a function of its features."""
    rng = np.random.default_rng(seed)
    incident = float(rng.uniform(0, 100))
    recency = float(rng.uniform(0, 100))
    infra = float(rng.uniform(0, 100))
    demo = float(rng.uniform(0, 100))
    trend = float(rng.uniform(0, 100))

    # A learnable relationship: risk rises with incidents and falls with
    # infrastructure. Without a real signal the tests would only measure noise.
    target = 0.45 * incident + 0.2 * recency + 0.15 * demo - 0.25 * infra + 30
    target = max(0.0, min(100.0, target + float(rng.normal(0, noise)) if noise else target))

    return {
        "incident_frequency_score": incident,
        "recency_score": recency,
        "demographic_risk_score": demo,
        "infrastructure_score": infra,
        "trend_score": trend,
        "population_density_per_sqkm": float(rng.uniform(500, 40000)),
        "female_literacy_rate_percent": float(rng.uniform(50, 95)),
        "unemployment_rate": float(rng.uniform(2, 20)),
        "below_poverty_line_percent": float(rng.uniform(5, 40)),
        "police_per_1000": float(rng.uniform(0.2, 3)),
        "streetlights_per_km": float(rng.uniform(5, 100)),
        "cctv_count": float(rng.integers(0, 800)),
        "public_transport_routes": float(rng.integers(0, 120)),
        "total_population": 100000.0,
        "female_population": 48000.0,
        "zone_type": zone_type,
        "overall_score": target,
    }


def batch(n: int, start: int = 0, **kw) -> list[dict]:
    return [make_row(start + i, **kw) for i in range(n)]


# ---------------------------------------------------------------- feature contract


def test_feature_vector_length_matches_contract():
    assert len(featurise(make_row(1))) == len(FEATURE_NAMES)


def test_every_feature_has_declared_bounds():
    # A feature without bounds would be scaled by whatever the first batch
    # happened to contain.
    assert set(FEATURE_BOUNDS) == set(FEATURE_NAMES)


def test_features_are_scaled_into_unit_range():
    vec = featurise(make_row(2))
    assert all(0.0 <= v <= 1.0 for v in vec), vec


def test_out_of_range_values_are_clipped_not_rejected():
    row = make_row(3)
    row["incident_frequency_score"] = 10_000
    row["police_per_1000"] = -50
    vec = featurise(row)
    assert all(0.0 <= v <= 1.0 for v in vec)


def test_missing_value_imputes_midpoint_not_zero():
    # Zero is a meaningful low value for most of these; imputing it would teach
    # the model that "missing" means "none of this thing".
    row = make_row(4)
    row["streetlights_per_km"] = None
    vec = featurise(row)
    assert vec[FEATURE_NAMES.index("streetlights_per_km")] == 0.5


def test_zone_type_is_one_hot():
    vec = featurise(make_row(5, zone_type="commercial"))
    assert vec[FEATURE_NAMES.index("zone_type_commercial")] == 1.0
    assert vec[FEATURE_NAMES.index("zone_type_residential")] == 0.0


def test_unknown_zone_type_falls_back_to_mixed():
    vec = featurise({**make_row(6), "zone_type": "spaceport"})
    assert vec[FEATURE_NAMES.index("zone_type_mixed")] == 1.0


def test_female_share_is_derived():
    vec = featurise(make_row(7))
    assert vec[FEATURE_NAMES.index("female_population_share")] == pytest.approx(0.48, abs=1e-6)


# ---------------------------------------------------------------- updating


def test_first_update_fits_and_promotes():
    learner = IncrementalRiskLearner()
    res = learner.update(batch(200))
    assert res.promoted is True
    assert res.version == 1
    assert learner.is_fitted
    assert res.metrics is not None


def test_rejects_a_batch_that_is_too_small():
    learner = IncrementalRiskLearner()
    res = learner.update(batch(MIN_BATCH_ROWS - 1))
    assert res.promoted is False
    assert "below" in res.rejected_reason
    assert not learner.is_fitted


def test_rows_without_a_target_are_ignored():
    learner = IncrementalRiskLearner()
    rows = batch(200)
    for r in rows[:100]:
        r["overall_score"] = None
    res = learner.update(rows)
    assert res.samples_in_batch == 100


def test_error_improves_across_successive_uploads():
    # The whole premise: each upload should leave the model better, without
    # revisiting earlier data.
    learner = IncrementalRiskLearner()
    first = learner.update(batch(300, start=0))
    assert first.promoted

    for i in range(1, 8):
        learner.update(batch(300, start=i * 1000))

    final = learner.update(batch(300, start=99000))
    assert final.metrics is not None
    assert final.metrics.mae < first.metrics.mae, (
        f"MAE did not improve: {first.metrics.mae:.3f} -> {final.metrics.mae:.3f}"
    )


def test_version_increments_only_on_promotion():
    learner = IncrementalRiskLearner()
    learner.update(batch(200))
    v = learner.version
    rejected = learner.update(batch(MIN_BATCH_ROWS - 1))
    assert rejected.promoted is False
    assert learner.version == v


def test_samples_total_accumulates():
    learner = IncrementalRiskLearner()
    learner.update(batch(200, start=0))
    a = learner.samples_total
    learner.update(batch(200, start=500))
    assert learner.samples_total > a


# ---------------------------------------------------------------- promotion gate


def test_gate_rejects_a_corrupted_batch():
    """A mis-parsed upload must not be allowed to degrade the live model.

    This is the failure mode that makes naive online learning dangerous: one bad
    file and every later prediction is worse, with nothing in the logs to say why.
    """
    learner = IncrementalRiskLearner()
    for i in range(6):
        learner.update(batch(300, start=i * 1000))
    good_mae = learner.last_metrics.mae
    good_version = learner.version

    # Targets shuffled away from their features — the shape of a column-misaligned
    # import.
    corrupt = batch(300, start=50_000)
    scores = [r["overall_score"] for r in corrupt]
    rng = np.random.default_rng(7)
    rng.shuffle(scores)
    for r, s in zip(corrupt, scores):
        r["overall_score"] = s

    res = learner.update(corrupt)

    assert res.promoted is False, "a corrupted batch was accepted"
    assert "MAE worsened" in res.rejected_reason
    assert learner.version == good_version, "version advanced on a rejected update"
    assert learner.last_metrics.mae == good_mae, "live model was modified by a rejected batch"


def test_rejected_update_leaves_predictions_unchanged():
    learner = IncrementalRiskLearner()
    for i in range(5):
        learner.update(batch(300, start=i * 1000))

    probe = batch(10, start=777)
    before = learner.predict(probe)

    corrupt = batch(300, start=60_000)
    for r in corrupt:
        r["overall_score"] = 0.0 if r["overall_score"] > 50 else 100.0
    learner.update(corrupt)

    assert learner.predict(probe) == before


def test_tolerance_allows_a_marginally_worse_batch():
    # Held-out MAE is noisy; zero tolerance would reject healthy updates at
    # random and stall learning.
    assert MAE_REGRESSION_TOLERANCE > 0


# ---------------------------------------------------------------- predicting


def test_predict_before_any_update_raises():
    learner = IncrementalRiskLearner()
    with pytest.raises(RuntimeError):
        learner.predict(batch(5))


def test_predictions_stay_on_the_0_100_scale():
    learner = IncrementalRiskLearner()
    learner.update(batch(300))
    extreme = batch(20, start=9000)
    for r in extreme:
        r["incident_frequency_score"] = 100
        r["infrastructure_score"] = 0
    preds = learner.predict(extreme)
    assert all(0.0 <= p <= 100.0 for p in preds)


def test_predictions_respond_to_the_signal():
    learner = IncrementalRiskLearner()
    for i in range(8):
        learner.update(batch(300, start=i * 1000))

    base = make_row(4242)
    low = {**base, "incident_frequency_score": 5, "infrastructure_score": 95}
    high = {**base, "incident_frequency_score": 95, "infrastructure_score": 5}
    p_low, p_high = learner.predict([low, high])
    assert p_high > p_low


# ---------------------------------------------------------------- drift


def test_drift_is_none_on_the_first_batch():
    learner = IncrementalRiskLearner()
    res = learner.update(batch(200))
    assert res.drift is None


def test_drift_is_reported_on_later_batches():
    learner = IncrementalRiskLearner()
    learner.update(batch(200, start=0))
    res = learner.update(batch(200, start=5000))
    assert res.drift is not None
    assert res.drift >= 0.0


def test_large_distribution_shift_raises_drift():
    learner = IncrementalRiskLearner()
    learner.update(batch(300, start=0))
    shifted = batch(300, start=8000)
    for r in shifted:
        r["population_density_per_sqkm"] = 59_000
        r["cctv_count"] = 1990
        r["streetlights_per_km"] = 119
    res = learner.update(shifted)
    assert res.drift is not None and res.drift > 0.05


# ---------------------------------------------------------------- persistence


def test_save_and_load_round_trip(tmp_path):
    learner = IncrementalRiskLearner(artifact_dir=tmp_path)
    learner.update(batch(300))
    probe = batch(5, start=321)
    before = learner.predict(probe)
    path = learner.save()

    restored = IncrementalRiskLearner(artifact_dir=tmp_path)
    restored.load(path)
    assert restored.version == learner.version
    assert restored.samples_total == learner.samples_total
    assert restored.predict(probe) == before


def test_load_refuses_a_mismatched_feature_contract(tmp_path):
    """SGD weights are positional, so a changed contract must fail loudly.

    Loading silently would keep training a model whose weights no longer line up
    with the columns being fed to it — wrong answers with no error anywhere.
    """
    import joblib

    learner = IncrementalRiskLearner(artifact_dir=tmp_path)
    learner.update(batch(200))
    path = learner.save()

    blob = joblib.load(path)
    blob["feature_names"] = list(FEATURE_NAMES[:-3])
    joblib.dump(blob, path)

    with pytest.raises(ValueError, match="feature contract"):
        IncrementalRiskLearner(artifact_dir=tmp_path).load(path)


def test_save_writes_a_latest_pointer(tmp_path):
    learner = IncrementalRiskLearner(artifact_dir=tmp_path)
    learner.update(batch(200))
    learner.save()
    assert (tmp_path / "incremental_risk_sgd_latest.json").exists()


# ---------------------------------------------------------------- numerical safety


def test_metrics_are_finite_for_a_constant_target():
    # R2 is undefined when the target has no variance; it must not divide by zero.
    learner = IncrementalRiskLearner()
    rows = batch(200)
    for r in rows:
        r["overall_score"] = 50.0
    res = learner.update(rows)
    assert res.metrics is not None
    for v in res.metrics.to_dict().values():
        assert math.isfinite(v)
