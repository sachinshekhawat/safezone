"""Time-of-day risk model tests.

Reads the SAME golden vectors as shared/src/time-risk.test.ts. If the TypeScript
and Python implementations ever disagree, one of the two suites goes red — which
is the entire point of keeping the vectors outside both of them.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.models.time_risk import (
    MIN_INCIDENTS_TO_FIT,
    TIME_BANDS,
    band_def,
    band_for_hour,
    fit_band_exposures,
    risk_level_from_score,
    time_adjusted_risk,
)

VECTORS_PATH = (
    Path(__file__).resolve().parents[2] / "shared" / "testdata" / "time-risk-vectors.json"
)


def load_vectors() -> dict:
    if not VECTORS_PATH.exists():
        pytest.fail(
            f"Golden vectors missing at {VECTORS_PATH}. They are the only thing "
            "keeping the Python and TypeScript models in step — do not skip this."
        )
    return json.loads(VECTORS_PATH.read_text())


VECTORS = load_vectors()


# ---------------------------------------------------------------- band mapping


@pytest.mark.parametrize("hour,expected", sorted(VECTORS["bandForHour"].items(), key=lambda kv: int(kv[0])))
def test_band_for_hour_matches_golden(hour: str, expected: str):
    assert band_for_hour(int(hour)) == expected


def test_every_hour_resolves_to_a_band():
    # `night` wraps midnight (20 -> 0); an off-by-one would leave 20:00-23:59
    # unclassified, which is the window this feature exists for.
    seen = {band_for_hour(h) for h in range(24)}
    assert len(seen) == len(TIME_BANDS)


def test_bands_match_database_enum():
    assert [b.band for b in TIME_BANDS] == [
        "dawn",
        "morning",
        "afternoon",
        "evening",
        "night",
        "late_night",
    ]


def test_daylight_bands_have_zero_exposure():
    assert band_def("morning").exposure == 0.0
    assert band_def("afternoon").exposure == 0.0


# ---------------------------------------------------------------- golden cases


@pytest.mark.parametrize("case", VECTORS["cases"], ids=[c["name"] for c in VECTORS["cases"]])
def test_time_adjusted_risk_golden(case: dict):
    got = time_adjusted_risk(
        band=case["band"],
        risk_score=case["input"].get("riskScore"),
        infrastructure_score=case["input"].get("infrastructureScore"),
        zone_type=case["input"].get("zoneType"),
    )
    assert got.adjusted_score == case["expect"]["adjustedScore"]
    assert got.delta == case["expect"]["delta"]
    assert got.level == case["expect"]["level"]
    assert [f.type for f in got.factors] == case["expect"]["factorTypes"]


# ---------------------------------------------------------------- invariants


@pytest.mark.parametrize("band", [b.band for b in TIME_BANDS])
def test_never_leaves_the_scale(band: str):
    for score in (0, 1, 50, 99, 100):
        for infra in (0, 50, 100):
            got = time_adjusted_risk(
                band=band, risk_score=score, infrastructure_score=infra, zone_type="commercial"
            )
            assert 0 <= got.adjusted_score <= 100


@pytest.mark.parametrize("band", [b.band for b in TIME_BANDS])
def test_never_lowers_a_score(band: str):
    got = time_adjusted_risk(
        band=band, risk_score=45, infrastructure_score=60, zone_type="mixed"
    )
    assert got.adjusted_score >= 45


def test_worse_infrastructure_is_penalised_more():
    bad = time_adjusted_risk(
        band="late_night", risk_score=40, infrastructure_score=10, zone_type="mixed"
    )
    good = time_adjusted_risk(
        band="late_night", risk_score=40, infrastructure_score=90, zone_type="mixed"
    )
    assert bad.adjusted_score > good.adjusted_score


def test_unscored_zone_is_not_given_a_number():
    got = time_adjusted_risk(band="late_night", risk_score=None, infrastructure_score=10)
    assert got.adjusted_score is None
    assert got.level == "unscored"
    assert got.factors == []


@pytest.mark.parametrize("band", [b.band for b in TIME_BANDS])
def test_every_adjustment_is_explained(band: str):
    got = time_adjusted_risk(
        band=band, risk_score=40, infrastructure_score=40, zone_type="commercial"
    )
    if got.delta != 0:
        assert got.factors, f"{band} moved the score without naming a reason"


def test_js_rounding_agreement_on_exact_halves():
    # Python's round() is banker's rounding: round(51.25 * 10) would give 512,
    # where JavaScript's Math.round gives 513. This case hits that exact half, so
    # it pins the behaviour rather than leaving it to chance.
    got = time_adjusted_risk(
        band="night", risk_score=40, infrastructure_score=50, zone_type="residential"
    )
    assert got.adjusted_score == 51.3


def test_risk_level_thresholds_match_shared():
    assert risk_level_from_score(None) == "unscored"
    assert risk_level_from_score(0) == "very_low"
    assert risk_level_from_score(19.9) == "very_low"
    assert risk_level_from_score(20) == "low"
    assert risk_level_from_score(40) == "moderate"
    assert risk_level_from_score(60) == "high"
    assert risk_level_from_score(80) == "critical"
    assert risk_level_from_score(100) == "critical"


# ---------------------------------------------------------------- learning path


def test_fit_refuses_an_empty_table():
    # The project's current state: no incidents recorded at all. The model must
    # decline to produce weights rather than inventing them.
    assert fit_band_exposures({}) is None


def test_fit_refuses_a_thin_sample():
    thin = {"late_night": 10, "morning": 5}
    assert sum(thin.values()) < MIN_INCIDENTS_TO_FIT
    assert fit_band_exposures(thin) is None


def test_fit_normalises_per_hour_not_per_count():
    # morning spans 6 hours, late_night 4. Equal raw counts mean late_night has
    # the higher per-hour rate, and the fit must reflect that rather than calling
    # them equal.
    counts = {"morning": 120, "late_night": 120, "afternoon": 0, "evening": 0, "night": 0, "dawn": 0}
    fitted = fit_band_exposures(counts, min_incidents=100)
    assert fitted is not None
    assert fitted["late_night"] > fitted["morning"]


def test_fit_produces_exposures_in_range():
    counts = {
        "dawn": 40,
        "morning": 60,
        "afternoon": 50,
        "evening": 120,
        "night": 200,
        "late_night": 180,
    }
    fitted = fit_band_exposures(counts)
    assert fitted is not None
    assert set(fitted) == {b.band for b in TIME_BANDS}
    for band, exposure in fitted.items():
        assert 0.0 <= exposure <= 1.0, f"{band} = {exposure}"
    # Busiest band per hour anchors at 1.0, quietest at 0.0.
    assert max(fitted.values()) == 1.0
    assert min(fitted.values()) == 0.0


def test_fit_handles_a_flat_distribution():
    # If incidents are spread evenly there is no time signal, and the honest
    # answer is "no adjustment" rather than amplified noise.
    #
    # "Flat" means an equal rate per hour, which is counts proportional to each
    # band's span — not equal counts. Equal counts across a 6-hour morning and a
    # 4-hour late-night window is itself a real signal, and the model is right to
    # report one.
    flat = {}
    for b in TIME_BANDS:
        span = (b.end_hour - b.start_hour) % 24 or 24
        flat[b.band] = 50 * span

    fitted = fit_band_exposures(flat)
    assert fitted is not None
    assert all(v == 0.0 for v in fitted.values()), fitted


def test_fit_treats_equal_counts_across_unequal_spans_as_signal():
    # The counterpart to the test above: identical counts in a 6-hour band and a
    # 4-hour band means the shorter band is denser, and the fit must say so.
    counts = {b.band: 100 for b in TIME_BANDS}
    fitted = fit_band_exposures(counts)
    assert fitted is not None
    assert fitted["dawn"] == 1.0, "2-hour dawn band has the highest per-hour rate"
    assert fitted["morning"] == 0.0, "6-hour morning band has the lowest"
